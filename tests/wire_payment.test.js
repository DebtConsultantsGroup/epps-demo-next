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
