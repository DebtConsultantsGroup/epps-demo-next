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
