import { NextRequest, NextResponse } from 'next/server';
import { fetchByPMID, fetchByDOI, fetchFullTextFromPMC, fetchPDFFromPMC, fetchPDFFromUnpaywall, fetchPDFFromCORE } from '@/lib/ncbi';
import { extractTextFromPDF } from '@/lib/pdf-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface FetchPaperRequest {
  identifier: string;
  type: 'pmid' | 'doi';
}

export async function POST(request: NextRequest) {
  try {
    const body: FetchPaperRequest = await request.json();
    const { identifier, type } = body;

    if (!identifier) {
      return NextResponse.json(
        { error: 'Identifier is required' },
        { status: 400 }
      );
    }

    // Clean the identifier
    const cleanId = identifier.trim();

    // Validate PMID format
    if (type === 'pmid' && !/^\d+$/.test(cleanId)) {
      return NextResponse.json(
        { error: 'Invalid PMID format. PMID should be a number.' },
        { status: 400 }
      );
    }

    // Validate DOI format
    if (type === 'doi' && !cleanId.includes('/')) {
      return NextResponse.json(
        { error: 'Invalid DOI format. DOI should contain a forward slash.' },
        { status: 400 }
      );
    }

    // Fetch paper metadata
    let metadata;
    try {
      if (type === 'pmid') {
        metadata = await fetchByPMID(cleanId);
      } else {
        metadata = await fetchByDOI(cleanId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch paper';

      if (message.includes('not found') || message.includes('No PubMed')) {
        return NextResponse.json(
          { error: `Paper not found with ${type.toUpperCase()}: ${cleanId}` },
          { status: 404 }
        );
      }

      throw error;
    }

    // Try to get full text from PMC
    let fullText: string | null = null;
    let pmcid: string | null = null;
    let pdfBase64: string | null = null;

    if (metadata.pmid) {
      const pmcResult = await fetchFullTextFromPMC(metadata.pmid);
      fullText = pmcResult.text;
      pmcid = pmcResult.pmcid;

      // If we have a PMCID, also fetch the PDF for multimodal processing
      if (pmcid) {
        pdfBase64 = await fetchPDFFromPMC(pmcid);
      }
    }

    // Fallback cascade: if no PMC full text, try Unpaywall then CORE
    const doi = metadata.doi || (type === 'doi' ? cleanId : null);
    if (!fullText && doi) {
      console.log(`[fetch-paper] No PMC text, trying Unpaywall for DOI ${doi}`);
      pdfBase64 = await fetchPDFFromUnpaywall(doi);

      // If Unpaywall failed, try CORE
      if (!pdfBase64) {
        console.log(`[fetch-paper] Unpaywall failed, trying CORE for DOI ${doi}`);
        pdfBase64 = await fetchPDFFromCORE(doi);
      }

      if (pdfBase64) {
        // Extract text from the downloaded PDF
        try {
          const pdfBuffer = Buffer.from(pdfBase64, 'base64');
          fullText = await extractTextFromPDF(pdfBuffer);
          console.log(`[fetch-paper] Extracted ${fullText.length} chars from open access PDF`);
        } catch (extractError) {
          console.error('[fetch-paper] Failed to extract text from PDF:', extractError);
          // Keep pdfBase64 for multimodal even if text extraction fails
        }
      }
    }

    // Determine what text we have
    const hasFullText = !!fullText;
    const text = fullText || metadata.abstract || '';

    if (!text) {
      return NextResponse.json(
        {
          error: 'This paper is not open access. Please upload the PDF directly.',
          metadata: {
            title: metadata.title,
            authors: metadata.authors,
            journal: metadata.journal,
            pmid: metadata.pmid,
            doi: metadata.doi,
          },
          isOpenAccess: false,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      text,
      isOpenAccess: hasFullText,
      hasAbstractOnly: !hasFullText && !!metadata.abstract,
      hasPdf: !!pdfBase64,
      pdfBase64: pdfBase64 || undefined,
      metadata: {
        title: metadata.title,
        authors: metadata.authors,
        journal: metadata.journal,
        pubDate: metadata.pubDate,
        pmid: metadata.pmid,
        doi: metadata.doi,
      },
    });
  } catch (error) {
    console.error('Fetch paper error:', error);

    const message = error instanceof Error
      ? error.message
      : 'Failed to fetch paper';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
