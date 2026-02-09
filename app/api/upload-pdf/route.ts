import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPDF, getPDFMetadata } from '@/lib/pdf-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.includes('pdf')) {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 20MB limit' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get metadata first (quick check)
    const metadata = await getPDFMetadata(buffer);

    // Extract text
    const text = await extractTextFromPDF(buffer);

    // Return base64 PDF for optional multimodal processing
    const pdfBase64 = buffer.toString('base64');

    return NextResponse.json({
      success: true,
      text,
      pdfBase64,
      metadata: {
        pageCount: metadata.pageCount,
        title: metadata.title,
        author: metadata.author,
        fileName: file.name,
        fileSize: file.size,
      },
    });
  } catch (error) {
    console.error('PDF upload error:', error);

    const message = error instanceof Error
      ? error.message
      : 'Failed to process PDF';

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
