# Next.js Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert EPPS Demo from Vite+Express to Next.js App Router with unified API routes, keeping the tab-based UI and Vercel deployment.

**Architecture:** Single Next.js App Router application. Express SOAP proxy logic extracted to `lib/soap.js`, consumed by individual Route Handlers under `app/api/`. All existing React components reused as client components. No routing changes — stays tab-based.

**Tech Stack:** Next.js 15 (App Router), React 19, MUI 7, Recharts, easy-soap-request, xml2js

---

### Task 1: Extract SOAP Utility from Express Server

**Files:**
- Create: `lib/soap.js`
- Reference: `server.cjs` (for extraction, do not modify yet)

- [ ] **Step 1: Create `lib/soap.js` with SOAP core logic**

Extract the SOAP handling from `server.cjs` into a standalone module. This function returns data or throws — no Express `res` dependency.

```js
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
```

- [ ] **Step 2: Verify file was created**

Run: `node -e "import('./lib/soap.js').then(() => console.log('OK')).catch(e => console.error(e.message))"`
Expected: OK (module parses without syntax errors)

- [ ] **Step 3: Commit**

```bash
git add lib/soap.js
git commit -m "feat: extract SOAP utility from Express server into lib/soap.js"
```

---

### Task 2: Create Next.js Config and Root Layout

**Files:**
- Create: `next.config.js`
- Create: `app/layout.jsx`
- Create: `app/page.jsx`
- Modify: `src/App.jsx` (add `'use client'` directive)
- Modify: `src/main.jsx` (will be removed later, no changes now)

- [ ] **Step 1: Create `next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 2: Create `app/layout.jsx`**

```jsx
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';

export const metadata = {
  title: 'EPPS Service Portal | Demonstration',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap"
        />
      </head>
      <body>
        <AppRouterCacheProvider>
          {children}
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
```

Note: `@mui/material-nextjs` is needed for MUI + App Router SSR compatibility. It will be added as a dependency in Task 5.

- [ ] **Step 3: Create `app/page.jsx`**

```jsx
'use client';

import App from '../src/App';

export default function Page() {
  return <App />;
}
```

- [ ] **Step 4: Add `'use client'` directive to `src/App.jsx`**

Add `'use client';` as the very first line of `src/App.jsx`, before all imports:

```jsx
'use client';

import React, { useState } from 'react';
// ... rest of file unchanged
```

- [ ] **Step 5: Add `'use client'` to all component files**

Add `'use client';` as the first line of each file:
- `src/components/Dashboard.jsx`
- `src/components/Cardholders.jsx`
- `src/components/WireApiDemo.jsx`
- `src/components/PendingSettlements.jsx`
- `src/components/SalesforceExport.jsx`
- `src/components/StatusMonitor.jsx`
- `src/components/FeesManagement.jsx`
- `src/components/TransactionDetailModal.jsx`
- `src/components/EFTManagement.jsx`
- `src/components/CreditCardPayments.jsx`
- `src/components/WirePaymentProcessing.jsx`
- `src/components/StatusBreakdown.jsx`
- `src/components/Reconciliation.jsx`
- `src/hooks/useDashboardStats.js`
- `src/theme.js`
- `src/constants/statusConfig.js`

- [ ] **Step 6: Commit**

```bash
git add next.config.js app/layout.jsx app/page.jsx src/App.jsx src/components/ src/hooks/ src/theme.js src/constants/
git commit -m "feat: add Next.js app shell with root layout and client components"
```

---

### Task 3: Create API Route Handlers

**Files:**
- Create: `app/api/cardholders/find/route.js`
- Create: `app/api/cardholders/all/route.js`
- Create: `app/api/cardholders/efts/route.js`
- Create: `app/api/cardholders/fees/route.js`
- Create: `app/api/cardholders/fees-detailed/route.js`
- Create: `app/api/eft/find/route.js`
- Create: `app/api/eft/status-date/route.js`
- Create: `app/api/eft/history/route.js`
- Create: `app/api/deposits/find-by-date/route.js`
- Create: `app/api/fees/status-date/route.js`
- Create: `app/api/fees/find-by-date/route.js`

Each route handler follows the same pattern: parse the JSON body, call `handleSoapRequest`, return `NextResponse.json()`. Below is the full code for every route.

- [ ] **Step 1: Create `app/api/cardholders/find/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindCardHolderByID', { CardHolderID: body.cardholderId });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 2: Create `app/api/cardholders/all/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST() {
  try {
    const params = {
      UpdateDateFrom: '2000-01-01T00:00:00',
      UpdateDateTo: new Date().toISOString().split('.')[0]
    };
    const data = await handleSoapRequest('FindCardHolderByDate', params);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 3: Create `app/api/cardholders/efts/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindEftByID', { CardHolderID: body.cardholderId });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 4: Create `app/api/cardholders/fees/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindFeeByCardHolderID', { CardHolderID: body.cardholderId });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 5: Create `app/api/cardholders/fees-detailed/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindFeeByCardHolderID2', { CardHolderID: body.cardholderId });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 6: Create `app/api/eft/find/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.EftTransactionID) {
      return NextResponse.json(
        { error: 'EftTransactionID is required for lookup.' },
        { status: 400 }
      );
    }
    const data = await handleSoapRequest('FindEftByEFTTransactionID', { EFTTRansactionID: body.EftTransactionID });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 7: Create `app/api/eft/status-date/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindEftByStatusDate', body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 8: Create `app/api/eft/history/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindEftChangeByID', { EftTransactionID: body.EftTransactionID });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 9: Create `app/api/deposits/find-by-date/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindDepositDetailByDate', body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 10: Create `app/api/fees/status-date/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindFeeByStatusDate', body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 11: Create `app/api/fees/find-by-date/route.js`**

```js
import { NextResponse } from 'next/server';
import { handleSoapRequest } from '../../../../lib/soap.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await handleSoapRequest('FindFeeByDate', body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', details: error.message },
      { status: error.statusCode || 500 }
    );
  }
}
```

- [ ] **Step 12: Commit**

```bash
git add app/api/
git commit -m "feat: add Next.js API route handlers for all SOAP endpoints"
```

---

### Task 4: Update Tests for Next.js

**Files:**
- Modify: `tests/server.test.js`
- Modify: `tests/comprehensive.test.js`
- Modify: `tests/wire_payment.test.js`

The existing tests use `supertest` against the Express app. Since `server.cjs` is being removed, update tests to test `lib/soap.js` directly. The tests mock `easy-soap-request` and verify that `handleSoapRequest` returns the correct parsed data.

Note: Some existing tests reference endpoints (`/api/cardholders/add`, `/api/eft/add`, `/api/fees/add`, `/api/cc/add`) that don't exist in the current `server.cjs`. These tests would fail against the current app too. We'll convert only the tests for endpoints that actually exist, and remove the dead tests.

- [ ] **Step 1: Rewrite `tests/server.test.js`**

Replace the entire file:

```js
import { jest } from '@jest/globals';

// Mock easy-soap-request before importing soap.js
jest.unstable_mockModule('easy-soap-request', () => ({
  default: jest.fn(),
}));

const { default: soapRequest } = await import('easy-soap-request');
const { handleSoapRequest } = await import('../lib/soap.js');

// Provide required env vars
process.env.EPPS_WSDL_URL = 'http://test.example.com/soap?wsdl';
process.env.EPPS_USERNAME = 'testuser';
process.env.EPPS_PASSWORD = 'testpass';

describe('handleSoapRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('FindCardHolderByID - parses response correctly', async () => {
    soapRequest.mockResolvedValue({
      response: {
        statusCode: 200,
        body: `
          <?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <FindCardHolderByIDResponse>
                <FindCardHolderByIDResult>
                  <CardHolderList>
                    <CardHolderDetail>
                      <CardHolderID>CH001</CardHolderID>
                      <FirstName>John</FirstName>
                      <LastName>Doe</LastName>
                    </CardHolderDetail>
                  </CardHolderList>
                </FindCardHolderByIDResult>
              </FindCardHolderByIDResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    });

    const data = await handleSoapRequest('FindCardHolderByID', { CardHolderID: 'CH001' });
    expect(data.CardHolderList.CardHolderDetail.FirstName).toEqual('John');
  });

  test('SOAP fault throws with error data', async () => {
    soapRequest.mockResolvedValue({
      response: {
        statusCode: 200,
        body: `
          <?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <Fault>
                <faultstring>Invalid credentials</faultstring>
              </Fault>
            </soap:Body>
          </soap:Envelope>
        `
      }
    });

    await expect(handleSoapRequest('FindCardHolderByID', { CardHolderID: 'CH001' }))
      .rejects.toThrow('Invalid credentials');
  });

  test('Non-XML response throws with status 400', async () => {
    soapRequest.mockResolvedValue({
      response: {
        statusCode: 200,
        body: 'Not XML at all'
      }
    });

    try {
      await handleSoapRequest('FindCardHolderByID', { CardHolderID: 'CH001' });
      throw new Error('Should have thrown');
    } catch (error) {
      expect(error.statusCode).toBe(400);
      expect(error.data.StatusCode).toBe('Error');
    }
  });
});
```

- [ ] **Step 2: Rewrite `tests/comprehensive.test.js`**

Replace the entire file:

```js
import { jest } from '@jest/globals';

jest.unstable_mockModule('easy-soap-request', () => ({
  default: jest.fn(),
}));

const { default: soapRequest } = await import('easy-soap-request');
const { handleSoapRequest } = await import('../lib/soap.js');

process.env.EPPS_WSDL_URL = 'http://test.example.com/soap?wsdl';
process.env.EPPS_USERNAME = 'testuser';
process.env.EPPS_PASSWORD = 'testpass';

describe('EPPS SOAP Utility - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('FindDepositDetailByDate - parses deposit data', async () => {
    soapRequest.mockResolvedValue({
      response: {
        statusCode: 200,
        body: `
          <?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <FindDepositDetailByDateResponse>
                <FindDepositDetailByDateResult>
                  <deposits>
                    <DepositDetail>
                      <DepositDate>2023-10-25T00:00:00</DepositDate>
                      <DepositTotal>1500.00</DepositTotal>
                      <TransactionCount>3</TransactionCount>
                    </DepositDetail>
                  </deposits>
                </FindDepositDetailByDateResult>
              </FindDepositDetailByDateResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    });

    const data = await handleSoapRequest('FindDepositDetailByDate', {
      DepositStartDate: '2023-10-01',
      DepositEndDate: '2023-10-31'
    });
    expect(data.deposits.DepositDetail.DepositTotal).toEqual('1500.00');
  });

  test('FindEftByStatusDate - parses EFT status data', async () => {
    soapRequest.mockResolvedValue({
      response: {
        statusCode: 200,
        body: `
          <?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <FindEftByStatusDateResponse>
                <FindEftByStatusDateResult>
                  <EFTList>
                    <EFTTransactionDetail>
                      <EftTransactionID>12345</EftTransactionID>
                      <StatusCode>Settled</StatusCode>
                    </EFTTransactionDetail>
                  </EFTList>
                </FindEftByStatusDateResult>
              </FindEftByStatusDateResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    });

    const data = await handleSoapRequest('FindEftByStatusDate', {
      StatusDateFrom: '2023-10-25',
      StatusDateTo: '2023-10-25'
    });
    expect(data.EFTList.EFTTransactionDetail.StatusCode).toEqual('Settled');
  });
});
```

- [ ] **Step 3: Rewrite `tests/wire_payment.test.js`**

Replace the entire file:

```js
import { jest } from '@jest/globals';

jest.unstable_mockModule('easy-soap-request', () => ({
  default: jest.fn(),
}));

const { default: soapRequest } = await import('easy-soap-request');
const { handleSoapRequest } = await import('../lib/soap.js');

process.env.EPPS_WSDL_URL = 'http://test.example.com/soap?wsdl';
process.env.EPPS_USERNAME = 'testuser';
process.env.EPPS_PASSWORD = 'testpass';

describe('SOAP Utility - Fee/Wire Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('SOAP request includes correct param XML', async () => {
    soapRequest.mockResolvedValue({
      response: {
        statusCode: 200,
        body: `
          <?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <FindFeeByCardHolderIDResponse>
                <FindFeeByCardHolderIDResult>
                  <FeeList />
                </FindFeeByCardHolderIDResult>
              </FindFeeByCardHolderIDResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    });

    await handleSoapRequest('FindFeeByCardHolderID', { CardHolderID: 'CH001' });

    expect(soapRequest).toHaveBeenCalledWith(expect.objectContaining({
      xml: expect.stringContaining('<CardHolderID>CH001</CardHolderID>')
    }));
  });

  test('SOAP request sends correct SOAPAction header', async () => {
    soapRequest.mockResolvedValue({
      response: {
        statusCode: 200,
        body: `
          <?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <FindEftByIDResponse>
                <FindEftByIDResult>
                  <EFTList />
                </FindEftByIDResult>
              </FindEftByIDResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    });

    await handleSoapRequest('FindEftByID', { CardHolderID: 'CH001' });

    expect(soapRequest).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        'SOAPAction': '"http://tempuri.org/FindEftByID"'
      })
    }));
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "refactor: update tests to use lib/soap.js directly instead of Express supertest"
```

---

### Task 5: Update package.json and Dependencies

**Files:**
- Modify: `package.json`
- Delete: `tests/temp_placeholder.js`

- [ ] **Step 1: Install Next.js and MUI Next.js adapter**

Run: `npm install next @mui/material-nextjs`

- [ ] **Step 2: Uninstall removed dependencies**

Run: `npm uninstall @vitejs/plugin-react concurrently express cors`

Note: Keep `easy-soap-request`, `xml2js`, `dotenv` — they're used by `lib/soap.js`.

- [ ] **Step 3: Update `package.json` scripts**

Replace the scripts section:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  }
}
```

Note: `--experimental-vm-modules` is needed because the tests use ESM (`import`) with `jest.unstable_mockModule`.

- [ ] **Step 4: Remove `"type": "module"` override for vite and the `overrides` block**

Remove these from `package.json`:

```json
"overrides": {
  "vite": "npm:rolldown-vite@7.2.5"
}
```

- [ ] **Step 5: Add Jest ESM config to `package.json`**

Add to `package.json` at the top level:

```json
"jest": {
  "transform": {}
}
```

This tells Jest not to transform ESM files (since we're using `--experimental-vm-modules`).

- [ ] **Step 6: Delete `tests/temp_placeholder.js`**

Remove the placeholder file — it's not needed.

- [ ] **Step 7: Run `npm install` to regenerate lock file**

Run: `npm install`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json
git rm tests/temp_placeholder.js
git commit -m "feat: update dependencies and scripts for Next.js"
```

---

### Task 6: Remove Old Files and Update Config

**Files:**
- Delete: `server.cjs`
- Delete: `api/index.js`
- Delete: `vite.config.js`
- Delete: `index.html`
- Delete: `vercel.json`
- Delete: `src/main.jsx`
- Modify: `eslint.config.js`
- Modify: `.gitignore`

- [ ] **Step 1: Delete old files**

```bash
git rm server.cjs api/index.js vite.config.js index.html vercel.json src/main.jsx
```

- [ ] **Step 2: Update `eslint.config.js`**

Replace the entire file — remove Vite-specific plugins, use a simple config:

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['.next', 'out', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
```

- [ ] **Step 3: Update `.gitignore`**

Ensure `.next` is listed (it already is) and remove the `dist` entry since Vite's build output is no longer relevant. Also clean up the `public/*` gitignore rules since Next.js uses `public/` differently — keep the CSV file tracked.

Replace the Vite section at the bottom:

```
# Vite
dist
```

With:

```
# Next.js
.next
out
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx next build`
Expected: Build completes successfully

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Vite/Express files, update eslint and gitignore for Next.js"
```

---

### Task 7: Smoke Test

- [ ] **Step 1: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Start dev server and verify it loads**

Run: `npx next dev -p 3000`

Open `http://localhost:3000` in a browser. Verify:
- The EPPS Service Portal loads with the sidebar and dashboard
- No console errors related to missing modules or hydration mismatches

Stop the dev server after verification.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Build completes without errors

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address any smoke test issues"
```

Only create this commit if changes were needed during smoke testing.
