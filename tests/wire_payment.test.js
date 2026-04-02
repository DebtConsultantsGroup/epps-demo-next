const request = require('supertest');
const app = require('../server.cjs');
const soapRequest = require('easy-soap-request');

// Mock easy-soap-request
jest.mock('easy-soap-request');

describe('Wire Payment Processing Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Process Wire Payment - Creates correct Fee entries', async () => {
    // Mock successful AddFee response
    const mockResponse = {
      response: {
        statusCode: 200,
        body: `
          <?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <AddFeeResponse>
                <AddFeeResult>
                  <FeeID>88888</FeeID>
                  <StatusCode>Success</StatusCode>
                </AddFeeResult>
              </AddFeeResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    };
    soapRequest.mockResolvedValue(mockResponse);

    // 1. Test Vendor Fee (Program/Setup)
    const vendorFeePayload = {
      CardHolderID: 'CH001',
      FeeDate: '2023-10-26T00:00:00',
      FeeAmount: '50.00',
      Description: 'Wire 2023/10/26 - Fees',
      FeeType: 'VendorFee'
    };

    const res1 = await request(app)
      .post('/api/fees/add')
      .send(vendorFeePayload);

    expect(res1.statusCode).toEqual(200);
    expect(res1.body.FeeID).toEqual('88888');

    // Verify XML construction for Vendor Fee (Strict Order Check)
    const expectedXmlSnippet1 = '<CardHolderID>CH001</CardHolderID><FeeDate>2023-10-26T00:00:00</FeeDate><FeeAmount>50.00</FeeAmount><Description>Wire 2023/10/26 - Fees</Description><FeeType>VendorFee</FeeType>';
    expect(soapRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
      xml: expect.stringContaining(expectedXmlSnippet1)
    }));

    // 2. Test Wire Fee
    const wireFeePayload = {
      CardHolderID: 'CH001',
      FeeDate: '2023-10-26T00:00:00',
      FeeAmount: '10.00',
      Description: 'Wire Received Fee',
      FeeType: 'VendorFee'
    };

    const res2 = await request(app)
      .post('/api/fees/add')
      .send(wireFeePayload);

    expect(res2.statusCode).toEqual(200);
    expect(res2.body.FeeID).toEqual('88888');

     // Verify XML construction for Wire Fee (Strict Order Check)
     const expectedXmlSnippet2 = '<CardHolderID>CH001</CardHolderID><FeeDate>2023-10-26T00:00:00</FeeDate><FeeAmount>10.00</FeeAmount><Description>Wire Received Fee</Description><FeeType>VendorFee</FeeType>';
     expect(soapRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
       xml: expect.stringContaining(expectedXmlSnippet2)
     }));
  });

  test('Process Account Adjustment (Credit) - Creates Negative Fee', async () => {
    const mockResponse = {
      response: {
        statusCode: 200,
        body: `
          <?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <AddFeeResponse>
                <AddFeeResult>
                  <FeeID>99999</FeeID>
                  <StatusCode>Success</StatusCode>
                </AddFeeResult>
              </AddFeeResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    };
    soapRequest.mockResolvedValue(mockResponse);

    const adjustmentPayload = {
      CardHolderID: 'CH001',
      FeeDate: '2023-10-26T00:00:00',
      FeeAmount: '-1000.00',
      Description: 'Wire 2023/10/26',
      FeeType: 'Account Adjustment'
    };

    const res = await request(app)
      .post('/api/fees/add')
      .send(adjustmentPayload);

    expect(res.statusCode).toEqual(200);
    expect(res.body.FeeID).toEqual('99999');

    // Verify negative amount and Type in XML
    const expectedXml = '<CardHolderID>CH001</CardHolderID><FeeDate>2023-10-26T00:00:00</FeeDate><FeeAmount>-1000.00</FeeAmount><Description>Wire 2023/10/26</Description><FeeType>Account Adjustment</FeeType>';
    expect(soapRequest).toHaveBeenCalledWith(expect.objectContaining({
      xml: expect.stringContaining(expectedXml)
    }));
  });
});
