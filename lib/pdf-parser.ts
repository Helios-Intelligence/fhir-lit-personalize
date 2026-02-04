/**
 * PDF text extraction utility
 * Uses pdf-parse library for server-side PDF processing
 */

/**
 * Extract text content from a PDF buffer
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Dynamic import to ensure this only runs on server
  const pdfParse = (await import('pdf-parse')).default;

  try {
    const data = await pdfParse(buffer, {
      // Limit pages to prevent memory issues with very large PDFs
      max: 50,
    });

    // Clean up the extracted text
    let text = data.text;

    // Remove excessive whitespace while preserving paragraph breaks
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    // Remove common PDF artifacts
    text = text
      .replace(/\f/g, '\n') // Form feed characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Control characters

    if (!text || text.length < 100) {
      throw new Error('Could not extract meaningful text from PDF. The PDF may be scanned or image-based.');
    }

    return text;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid PDF') || error.message.includes('password')) {
        throw new Error('Invalid or password-protected PDF file');
      }
      throw error;
    }
    throw new Error('Failed to parse PDF file');
  }
}

/**
 * Get basic PDF metadata
 */
export async function getPDFMetadata(buffer: Buffer): Promise<{
  pageCount: number;
  title?: string;
  author?: string;
}> {
  const pdfParse = (await import('pdf-parse')).default;

  try {
    const data = await pdfParse(buffer, {
      max: 1, // Only need first page for metadata
    });

    return {
      pageCount: data.numpages,
      title: data.info?.Title,
      author: data.info?.Author,
    };
  } catch (error) {
    throw new Error('Failed to read PDF metadata');
  }
}
