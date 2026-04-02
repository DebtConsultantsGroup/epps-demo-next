const request = require('supertest');
const app = require('../server.cjs');
const soapRequest = require('easy-soap-request');

// Mock easy-soap-request to avoid real API calls
jest.mock('easy-soap-request');

describe('EPPS Proxy Server API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/cardholders/find - Success', async () => {
    // Mock SOAP response for FindCardHolderByID
    const mockSoapResponse = {
      response: {
        body: `
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
    };
    soapRequest.mockResolvedValue(mockSoapResponse);

    const res = await request(app)
      .post('/api/cardholders/find')
      .send({ cardholderId: 'CH001' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.CardHolderList.CardHolderDetail.FirstName).toEqual('John');
  });

  test('POST /api/cardholders/add - Success', async () => {
    const mockSoapResponse = {
      response: {
        body: `
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <AddCardHolderResponse>
                <AddCardHolderResult>
                   <CardHolderID>CH999</CardHolderID>
                   <StatusCode>Success</StatusCode>
                </AddCardHolderResult>
              </AddCardHolderResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    };
    soapRequest.mockResolvedValue(mockSoapResponse);

    const res = await request(app)
      .post('/api/cardholders/add')
      .send({ FirstName: 'Jane', LastName: 'Doe' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.StatusCode).toEqual('Success');
  });

  test('POST /api/eft/add - Success', async () => {
    const mockSoapResponse = {
      response: {
        body: `
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <AddEftResponse>
                <AddEftResult>
                   <EftTransactionID>123456</EftTransactionID>
                   <StatusCode>Success</StatusCode>
                </AddEftResult>
              </AddEftResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    };
    soapRequest.mockResolvedValue(mockSoapResponse);

    const res = await request(app)
      .post('/api/eft/add')
      .send({ Amount: '100.00', CardHolderID: 'CH001' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.EftTransactionID).toEqual('123456');
  });

  test('POST /api/fees/add - Success', async () => {
    const mockSoapResponse = {
      response: {
        body: `
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <AddFeeResponse>
                <AddFeeResult>
                   <FeeID>9988</FeeID>
                   <StatusCode>Success</StatusCode>
                </AddFeeResult>
              </AddFeeResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    };
    soapRequest.mockResolvedValue(mockSoapResponse);

    const res = await request(app)
      .post('/api/fees/add')
      .send({ 
        FeeType: 'SettlementPayment', 
        FeeAmount: '500.00', 
        CardHolderID: 'CH001' 
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.FeeID).toEqual('9988');
  });
});