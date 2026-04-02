const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const soapRequest = require('easy-soap-request');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');

const SOAP_LOG_FILE = path.join(__dirname, 'soap-statement.log');

const logSoapToFile = (method, requestXml, responseXml) => {
  const timestamp = new Date().toISOString();
  const entry = [
    `\n${'='.repeat(80)}`,
    `[${timestamp}] SOAP Call: ${method}`,
    `${'='.repeat(80)}`,
    `--- REQUEST ---`,
    requestXml,
    `--- RESPONSE ---`,
    responseXml,
    `${'='.repeat(80)}\n`,
  ].join('\n');
  fs.appendFileSync(SOAP_LOG_FILE, entry, 'utf8');
};

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const url = process.env.EPPS_WSDL_URL;
const username = process.env.EPPS_USERNAME;
const password = process.env.EPPS_PASSWORD;

const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });

// --- Outbound SOAP concurrency limiter ---
// Caps simultaneous in-flight SOAP calls to the EPPS API to avoid rate limiting.
const MAX_CONCURRENT_SOAP = 3;
let activeSoapCalls = 0;
const soapQueue = [];

const acquireSoapSlot = () =>
  new Promise((resolve) => {
    if (activeSoapCalls < MAX_CONCURRENT_SOAP) {
      activeSoapCalls++;
      resolve();
    } else {
      soapQueue.push(resolve);
    }
  });

const releaseSoapSlot = () => {
  if (soapQueue.length > 0) {
    const next = soapQueue.shift();
    next(); // next caller takes the slot immediately
  } else {
    activeSoapCalls--;
  }
};

// No write methods; all endpoints are read-only
const methodParams = {};

// Generic SOAP Handler
const handleSoapRequest = async (method, params, res, responsePath) => {
  const soapAction = `http://tempuri.org/${method}`;
  
  let paramXml = '';
  const orderedKeys = methodParams[method];

  if (orderedKeys) {
    // Use strict order defined in methodParams
    for (const key of orderedKeys) {
      // Send empty tag if value is missing to satisfy strict positional parsers
      const val = (params[key] !== undefined && params[key] !== null) ? params[key] : '';
      paramXml += `<${key}>${val}</${key}>`;
    }
  } else {
    // Fallback to object keys (legacy/simple methods)
    for (const [key, value] of Object.entries(params)) {
      paramXml += `<${key}>${value}</${key}>`;
    }
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${method} xmlns="http://tempuri.org/">
      <UserName>${username}</UserName>
      <PassWord>${password}</PassWord>
      ${paramXml}
    </${method}>
  </soap:Body>
</soap:Envelope>`;

  // Debug Log (Mask Password)
  console.log(`Sending XML to ${method}:`, xml.replace(/<PassWord>.*?<\/PassWord>/, '<PassWord>***</PassWord>'));

  await acquireSoapSlot();
  let soapResponse;
  try {
    ({ response: soapResponse } = await soapRequest({
      url: url.split('?')[0], // Ensure we don't post to ?wsdl
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': `"${soapAction}"`,
        'User-Agent': 'EPPS-Node-Client/1.0'
      },
      xml
    }));
  } catch (error) {
    releaseSoapSlot();
    console.error(`Error in ${method} (SOAP call):`, error);
    return res.status(500).json({ error: 'SOAP Request Failed', details: error.message });
  }
  releaseSoapSlot(); // Release as soon as HTTP call completes, before parsing

  try {
    if (soapResponse.statusCode !== 200) {
      console.log(`${method} response body:`, soapResponse.body?.substring(0, 500));
    }

    // Check if response is XML before parsing
    const responseBody = soapResponse.body;
    if (!responseBody || !responseBody.trim().startsWith('<?xml') && !responseBody.trim().startsWith('<')) {
      console.error(`Non-XML response from ${method}:`, responseBody?.substring(0, 200));
      return res.status(400).json({
        StatusCode: 'Error',
        Message: responseBody || 'Empty response from EPPS API',
        error: 'Invalid API Response'
      });
    }

    // Log full raw WSDL request + response for all key calls
    if (method === 'FindEftByID' || method === 'FindFeeByCardHolderID2' || method === 'FindCardHolderByDate') {
      logSoapToFile(method, xml.replace(/<PassWord>.*?<\/PassWord>/, '<PassWord>***</PassWord>'), responseBody);
      console.log(`[SOAP Log] ${method} written to soap-statement.log`);
    }

    const result = await parser.parseStringPromise(responseBody);

    // Check for SOAP Fault
    if (result['soap:Envelope']['soap:Body'].Fault) {
      const fault = result['soap:Envelope']['soap:Body'].Fault;
      return res.status(400).json({
        error: 'EPPS API Fault',
        message: fault.faultstring || 'Unknown SOAP Fault',
        detail: fault.detail
      });
    }

    let data = result['soap:Envelope']['soap:Body'];

    if (responsePath) {
      for (const key of responsePath) {
         if (data && data[key]) {
           data = data[key];
         }
      }
    } else {
       // Default convention: MethodResponse -> MethodResult
       const responseKey = `${method}Response`;
       const resultKey = `${method}Result`;
       if (data[responseKey]) {
         data = data[responseKey][resultKey];
       }
    }

    res.json(data);
  } catch (error) {
    console.error(`Error in ${method} (parse/response):`, error);
    res.status(500).json({ error: 'SOAP Request Failed', details: error.message });
  }
};

// --- Cardholder Endpoints ---

app.post('/api/cardholders/find', (req, res) => {
  handleSoapRequest('FindCardHolderByID', { CardHolderID: req.body.cardholderId }, res);
});

app.post('/api/cardholders/all', (req, res) => {
  // Broad range to catch "all" accounts
  const params = {
    UpdateDateFrom: '2000-01-01T00:00:00',
    UpdateDateTo: new Date().toISOString().split('.')[0] // Current time
  };
  handleSoapRequest('FindCardHolderByDate', params, res);
});

app.post('/api/cardholders/efts', (req, res) => {
  handleSoapRequest('FindEftByID', { CardHolderID: req.body.cardholderId }, res);
});

app.post('/api/cardholders/fees', (req, res) => {
  handleSoapRequest('FindFeeByCardHolderID', { CardHolderID: req.body.cardholderId }, res);
});

app.post('/api/cardholders/fees-detailed', (req, res) => {
  handleSoapRequest('FindFeeByCardHolderID2', { CardHolderID: req.body.cardholderId }, res);
});

// --- EFT Endpoints ---

app.post('/api/eft/find', (req, res) => {
  // Can expand logic here to choose between FindEftByID, FindEftByDate, etc. based on params
  // For now, defaulting to FindEftByEFTTransactionID
  if (req.body.EftTransactionID) {
    handleSoapRequest('FindEftByEFTTransactionID', { EFTTRansactionID: req.body.EftTransactionID }, res);
  } else {
    // Fallback or error
    res.status(400).json({ error: 'EftTransactionID is required for lookup.' });
  }
});

// --- Deposit / Reconciliation Endpoints ---

app.post('/api/deposits/find-by-date', (req, res) => {
  // Expects: DepositStartDate, DepositEndDate
  handleSoapRequest('FindDepositDetailByDate', req.body, res);
});

// --- Status Monitoring Endpoints ---

app.post('/api/eft/status-date', (req, res) => {
  // Expects: StatusDateFrom, StatusDateTo
  handleSoapRequest('FindEftByStatusDate', req.body, res);
});

app.post('/api/fees/status-date', (req, res) => {
  // Expects: StatusDateFrom, StatusDateTo
  handleSoapRequest('FindFeeByStatusDate', req.body, res);
});

app.post('/api/fees/find-by-date', (req, res) => {
  // Expects: FeeDateFrom, FeeDateTo
  handleSoapRequest('FindFeeByDate', req.body, res);
});

// --- Audit / History Endpoints ---

app.post('/api/eft/history', (req, res) => {
  // Expects: EftTransactionID
  handleSoapRequest('FindEftChangeByID', { EftTransactionID: req.body.EftTransactionID }, res);
});

// Serve Vite build from the same origin as /api (avoids proxy; use after `npm run build`)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Express 5 / path-to-regexp: bare `*` is invalid; use middleware for SPA fallback
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

// Only start server if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    const serving = fs.existsSync(distPath) ? 'API + static' : 'API only (run Vite for UI)';
    console.log(`${serving} — http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[epps-demo] Port ${PORT} is already in use. Another app may be answering /api requests.\n` +
          `Set PORT in .env to a free port (e.g. 3010) and use the same value for Vite (vite.config loads .env).`
      );
    } else {
      console.error('[epps-demo] Server error:', err);
    }
    process.exit(1);
  });
}

module.exports = app;
