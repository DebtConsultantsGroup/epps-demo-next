import soapRequest from 'easy-soap-request';
import { Parser } from 'xml2js';
import fs from 'fs';
import path from 'path';

const SOAP_LOG_FILE = path.join(process.cwd(), 'soap-statement.log');

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

const parser = new Parser({ explicitArray: false, ignoreAttrs: true });

// --- Outbound SOAP concurrency limiter ---
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
    next();
  } else {
    activeSoapCalls--;
  }
};

// No write methods; all endpoints are read-only
const methodParams = {};

/**
 * Execute a SOAP request against the EPPS API.
 * @param {string} method - SOAP method name
 * @param {object} params - Key/value params for the SOAP body
 * @param {string[]|null} responsePath - Custom path to traverse the response, or null for default
 * @returns {object} Parsed response data
 * @throws {Error} On SOAP fault or request failure
 */
export async function handleSoapRequest(method, params, responsePath = null) {
  const url = process.env.EPPS_WSDL_URL;
  const username = process.env.EPPS_USERNAME;
  const password = process.env.EPPS_PASSWORD;

  const soapAction = `http://tempuri.org/${method}`;

  let paramXml = '';
  const orderedKeys = methodParams[method];

  if (orderedKeys) {
    for (const key of orderedKeys) {
      const val = (params[key] !== undefined && params[key] !== null) ? params[key] : '';
      paramXml += `<${key}>${val}</${key}>`;
    }
  } else {
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

  console.log(`Sending XML to ${method}:`, xml.replace(/<PassWord>.*?<\/PassWord>/, '<PassWord>***</PassWord>'));

  await acquireSoapSlot();
  let soapResponse;
  try {
    ({ response: soapResponse } = await soapRequest({
      url: url.split('?')[0],
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
    throw new Error(`SOAP Request Failed: ${error.message}`);
  }
  releaseSoapSlot();

  if (soapResponse.statusCode !== 200) {
    console.log(`${method} response body:`, soapResponse.body?.substring(0, 500));
  }

  const responseBody = soapResponse.body;
  if (!responseBody || (!responseBody.trim().startsWith('<?xml') && !responseBody.trim().startsWith('<'))) {
    console.error(`Non-XML response from ${method}:`, responseBody?.substring(0, 200));
    const err = new Error(responseBody || 'Empty response from EPPS API');
    err.statusCode = 400;
    err.data = {
      StatusCode: 'Error',
      Message: responseBody || 'Empty response from EPPS API',
      error: 'Invalid API Response'
    };
    throw err;
  }

  if (method === 'FindEftByID' || method === 'FindFeeByCardHolderID2' || method === 'FindCardHolderByDate') {
    logSoapToFile(method, xml.replace(/<PassWord>.*?<\/PassWord>/, '<PassWord>***</PassWord>'), responseBody);
    console.log(`[SOAP Log] ${method} written to soap-statement.log`);
  }

  const result = await parser.parseStringPromise(responseBody);

  if (result['soap:Envelope']['soap:Body'].Fault) {
    const fault = result['soap:Envelope']['soap:Body'].Fault;
    const err = new Error(fault.faultstring || 'Unknown SOAP Fault');
    err.statusCode = 400;
    err.data = {
      error: 'EPPS API Fault',
      message: fault.faultstring || 'Unknown SOAP Fault',
      detail: fault.detail
    };
    throw err;
  }

  let data = result['soap:Envelope']['soap:Body'];

  if (responsePath) {
    for (const key of responsePath) {
      if (data && data[key]) {
        data = data[key];
      }
    }
  } else {
    const responseKey = `${method}Response`;
    const resultKey = `${method}Result`;
    if (data[responseKey]) {
      data = data[responseKey][resultKey];
    }
  }

  return data;
}
