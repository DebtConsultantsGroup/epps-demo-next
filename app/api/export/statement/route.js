import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { csvContent, filename, outputDir } = await request.json();

    if (!csvContent || !filename || !outputDir) {
      return NextResponse.json(
        { error: 'csvContent, filename, and outputDir are required' },
        { status: 400 }
      );
    }

    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');

    // Create directory if it doesn't exist
    const resolvedDir = path.resolve(outputDir);
    fs.mkdirSync(resolvedDir, { recursive: true });

    // Write file
    const filePath = path.join(resolvedDir, sanitizedFilename);
    fs.writeFileSync(filePath, csvContent, 'utf8');

    return NextResponse.json({ success: true, filePath });
  } catch (error) {
    console.error('Error writing statement file:', error);
    return NextResponse.json(
      { error: 'Failed to write file', details: error.message },
      { status: 500 }
    );
  }
}
