const request = require('supertest');
const app = require('../server.cjs');
const soapRequest = require('easy-soap-request');

// Mock easy-soap-request
jest.mock('easy-soap-request');

describe('EPPS Comprehensive API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Deposit Tests ---
  test('POST /api/deposits/find-by-date - Success', async () => {
    const mockResponse = {
      response: {
        body: `
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
    };
    soapRequest.mockResolvedValue(mockResponse);

    const res = await request(app)
      .post('/api/deposits/find-by-date')
      .send({ DepositStartDate: '2023-10-01', DepositEndDate: '2023-10-31' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.deposits.DepositDetail.DepositTotal).toEqual('1500.00');
  });

  // --- Credit Card Tests ---
  test('POST /api/cc/add - Success', async () => {
    const mockResponse = {
      response: {
        body: `
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <AddCreditCardDebitResponse>
                <AddCreditCardDebitResult>
                  <EftTransactionID>990011</EftTransactionID>
                  <StatusCode>Success</StatusCode>
                </AddCreditCardDebitResult>
              </AddCreditCardDebitResponse>
            </soap:Body>
          </soap:Envelope>
        `
      }
    };
    soapRequest.mockResolvedValue(mockResponse);

    const res = await request(app)
      .post('/api/cc/add')
      .send({ CardHolderID: 'CH001', Amount: '50.00' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.EftTransactionID).toEqual('990011');
  });

  // --- Status Monitor Tests ---
  test('POST /api/eft/status-date - Success', async () => {
    const mockResponse = {
      response: {
        body: `
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
    };
    soapRequest.mockResolvedValue(mockResponse);

    const res = await request(app)
      .post('/api/eft/status-date')
      .send({ StatusDateFrom: '2023-10-25', StatusDateTo: '2023-10-25' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.EFTList.EFTTransactionDetail.StatusCode).toEqual('Settled');
  });
});
