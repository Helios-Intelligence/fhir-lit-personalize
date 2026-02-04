import { NextRequest, NextResponse } from 'next/server';
import { fetchByPMID, fetchByDOI, fetchFullTextFromPMC } from '@/lib/ncbi';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
    if (metadata.pmid) {
      fullText = await fetchFullTextFromPMC(metadata.pmid);
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
