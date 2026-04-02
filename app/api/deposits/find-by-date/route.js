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
