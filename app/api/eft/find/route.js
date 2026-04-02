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
