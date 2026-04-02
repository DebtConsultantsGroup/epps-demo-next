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
