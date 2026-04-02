'use client';

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip
} from '@mui/material';

const methodRows = [
  {
    method: 'FindCardHolderByDate',
    soapAction: 'http://tempuri.org/FindCardHolderByDate',
    appUse: 'Loads clients for selection before submitting a wire.',
    docRef: 'EPPS_EFTService_2025.docx.md (FindCardHolder methods), epps-wsdl.md'
  },
  {
    method: 'AddFee',
    soapAction: 'http://tempuri.org/AddFee',
    appUse: 'Creates program/setup fee, wire fee, and net account adjustment for a wire.',
    docRef: 'EPPS_EFTService_2025.docx.md (AddFee Method), epps-wsdl.md'
  }
];

const flowSteps = [
  'Lookup cardholder: call FindCardHolderByDate and select CardHolderID.',
  'Validate and format date as YYYY-MM-DDTHH:NN:SS (required by EPPS SOAP parser).',
  'Submit AddFee for program/setup fees (if total > 0).',
  'Submit AddFee for wire processing fee (if > 0).',
  'Submit AddFee for net account credit as negative FeeAmount (current app behavior).',
  'Treat response as successful when FeeID is returned or StatusCode is Success.'
];

const recordRows = [
  {
    record: 'Record 1: Program + Setup Fee',
    createdWhen: 'totalFees > 0',
    feeAmount: 'programFee + setupFee',
    description: 'Wire {YYYY/MM/DD} - Fees'
  },
  {
    record: 'Record 2: Wire Processing Fee',
    createdWhen: 'wireFee > 0',
    feeAmount: 'wireFee',
    description: 'Wire Received Fee'
  },
  {
    record: 'Record 3: Net Account Adjustment',
    createdWhen: 'always (if net > 0)',
    feeAmount: '-(amountReceived - totalFees)',
    description: 'Wire {YYYY/MM/DD}'
  }
];

const frontendCode = `// src/components/WirePaymentProcessing.jsx
const totalFees = Number.parseFloat((programFee + setupFee).toFixed(2));
const netAmount = Number.parseFloat((amountReceived - totalFees).toFixed(2));

if (totalFees > 0) {
  await submitFee({
    CardHolderID: cardHolderId,
    FeeDate: \`\${normalizedDate}T00:00:00\`,
    FeeAmount: totalFees.toFixed(2),
    Description: \`Wire \${dateStr} - Fees\`,
    FeeType: 'Account Adjustment'
  });
}

if (wireFee > 0) {
  await submitFee({
    CardHolderID: cardHolderId,
    FeeDate: \`\${normalizedDate}T00:00:00\`,
    FeeAmount: wireFee.toFixed(2),
    Description: 'Wire Received Fee',
    FeeType: 'Account Adjustment'
  });
}

await submitFee({
  CardHolderID: cardHolderId,
  FeeDate: \`\${normalizedDate}T00:00:00\`,
  FeeAmount: \`-\${netAmount.toFixed(2)}\`,
  Description: \`Wire \${dateStr}\`,
  FeeType: 'Account Adjustment'
});`;

const apiRouteCode = `// server.cjs
app.post('/api/fees/add', (req, res) => {
  console.log('AddFee request body:', JSON.stringify(req.body, null, 2));

  const amount = parseFloat(req.body.FeeAmount);
  if (amount < 0) {
    console.log('WARNING: Negative FeeAmount detected. EPPS API may not support this.');
  }

  handleSoapRequest('AddFee', req.body, res);
});`;

const soapTransportCode = `// server.cjs -> handleSoapRequest(method, params, res)
const soapAction = \`http://tempuri.org/\${method}\`;
let paramXml = '';

for (const key of orderedKeys) {
  const val = (params[key] !== undefined && params[key] !== null) ? params[key] : '';
  paramXml += \`<\${key}>\${val}</\${key}>\`;
}

const xml = \`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <\${method} xmlns="http://tempuri.org/">
      <UserName>\${username}</UserName>
      <PassWord>\${password}</PassWord>
      \${paramXml}
    </\${method}>
  </soap:Body>
</soap:Envelope>\`;

const { response } = await soapRequest({
  url: url.split('?')[0],
  headers: {
    'Content-Type': 'text/xml;charset=UTF-8',
    SOAPAction: \`"\${soapAction}"\`,
    'User-Agent': 'EPPS-Node-Client/1.0'
  },
  xml
});`;

const responseParsingCode = `// server.cjs -> parse EPPS SOAP XML and return AddFeeResult JSON
const result = await parser.parseStringPromise(response.body);

if (result['soap:Envelope']['soap:Body'].Fault) {
  return res.status(400).json({
    error: 'EPPS API Fault',
    message: fault.faultstring
  });
}

let data = result['soap:Envelope']['soap:Body'];
const responseKey = \`\${method}Response\`;  // AddFeeResponse
const resultKey = \`\${method}Result\`;      // AddFeeResult

if (data[responseKey]) {
  data = data[responseKey][resultKey];
}

res.json(data); // Includes FeeID, StatusCode, Message, StatusDate`;

const proxyExample = `POST /api/fees/add
Content-Type: application/json

{
  "CardHolderID": "0040",
  "FeeDate": "2026-02-17T00:00:00",
  "FeeAmount": "-1195.00",
  "Description": "Wire 2026/02/17",
  "FeeType": "Account Adjustment"
}`;

const csvExample = `CardHolderID,AmountReceived,DateReceived,ProgramFee,SetupFee,WireFee,SenderName,Reference
0040,1250.00,2026-02-17,45.00,0.00,10.00,Atlas Funding LLC,WIRE-0040-A
0042,980.50,2026-02-17,25.00,15.00,10.00,Blue Ridge Capital,WIRE-0042-B`;

const soapExample = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <AddFee xmlns="http://tempuri.org/">
      <UserName>YOUR_EPPS_USERNAME</UserName>
      <PassWord>YOUR_EPPS_PASSWORD</PassWord>
      <CardHolderID>0040</CardHolderID>
      <FeeDate>2026-02-17T00:00:00</FeeDate>
      <FeeAmount>-1195.00</FeeAmount>
      <Description>Wire 2026/02/17</Description>
      <FeeType>Account Adjustment</FeeType>
      <PaidToName></PaidToName>
      <PaidToPhone></PaidToPhone>
      <PaidToStreet></PaidToStreet>
      <PaidToStreet2></PaidToStreet2>
      <PaidToCity></PaidToCity>
      <PaidToState></PaidToState>
      <PaidToZip></PaidToZip>
      <ContactName></ContactName>
      <PaidToCustomerNumber></PaidToCustomerNumber>
    </AddFee>
  </soap:Body>
</soap:Envelope>`;

const CodeBlock = ({ text }) => (
  <Box
    component="pre"
    sx={{
      m: 0,
      p: 2,
      borderRadius: 1,
      bgcolor: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'monospace',
      fontSize: '0.82rem',
      lineHeight: 1.45,
      overflowX: 'auto'
    }}
  >
    {text}
  </Box>
);

const WireApiDemo = () => {
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Wire API Demo
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        This tab documents the EPPS SOAP methods used by Wire Payments and shows how to execute a single wire payment upload through the API path implemented in this app.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Methods Used
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Method</TableCell>
                <TableCell>SOAP Action</TableCell>
                <TableCell>How This App Uses It</TableCell>
                <TableCell>Doc Reference</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {methodRows.map((row) => (
                <TableRow key={row.method}>
                  <TableCell>
                    <Chip size="small" label={row.method} color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{row.soapAction}</TableCell>
                  <TableCell>{row.appUse}</TableCell>
                  <TableCell>{row.docRef}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Single Wire Upload Flow
        </Typography>
        <Box component="ol" sx={{ mt: 0, mb: 0, pl: 3 }}>
          {flowSteps.map((step) => (
            <li key={step}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {step}
              </Typography>
            </li>
          ))}
        </Box>
        <Divider sx={{ my: 2 }} />
        <Typography variant="body2" color="textSecondary">
          EPPS docs define AddFee with required fields: UserName, PassWord, CardHolderID, FeeDate, FeeAmount, FeeType.
          Dates must use YYYY-MM-DDTHH:NN:SS.
        </Typography>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Three EPPS Records Created
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Record</TableCell>
                <TableCell>Created When</TableCell>
                <TableCell>FeeAmount</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recordRows.map((row) => (
                <TableRow key={row.record}>
                  <TableCell>{row.record}</TableCell>
                  <TableCell>{row.createdWhen}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{row.feeAmount}</TableCell>
                  <TableCell>{row.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Step 1: Frontend Builds Three AddFee Calls
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Source: src/components/WirePaymentProcessing.jsx
        </Typography>
        <CodeBlock text={frontendCode} />
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Step 2: API Route Forwards to AddFee
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Source: server.cjs
        </Typography>
        <CodeBlock text={apiRouteCode} />
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Step 3: SOAP Envelope Sent to EPPS
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Source: server.cjs handleSoapRequest(...)
        </Typography>
        <CodeBlock text={soapTransportCode} />
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Step 4: EPPS Response Parsed and Returned
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Source: server.cjs handleSoapRequest(...)
        </Typography>
        <CodeBlock text={responseParsingCode} />
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Bulk CSV Examples
        </Typography>
        <CodeBlock text={csvExample} />
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          App-Level Request Example (Proxy)
        </Typography>
        <CodeBlock text={proxyExample} />
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Direct EPPS SOAP Example
        </Typography>
        <CodeBlock text={soapExample} />
      </Paper>
    </Box>
  );
};

export default WireApiDemo;
