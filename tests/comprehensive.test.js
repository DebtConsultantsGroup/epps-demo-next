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
