import { NextRequest, NextResponse } from 'next/server';
import { parsePaperWithLLM, summarizePaperFindings } from '@/lib/paper-parser';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface PaperMetadata {
  title?: string;
  authors?: string[];
  journal?: string;
  pmid?: string;
  doi?: string;
}

interface ParsePaperRequest {
  paperText: string;
  source: 'pdf' | 'pmid' | 'doi';
  metadata?: PaperMetadata;
}

export async function POST(request: NextRequest) {
  try {
    const body: ParsePaperRequest = await request.json();
    const { paperText, source, metadata } = body;

    if (!paperText) {
      return NextResponse.json(
        { error: 'Paper text is required' },
        { status: 400 }
      );
    }

    if (paperText.length < 500) {
      return NextResponse.json(
        { error: 'Paper text is too short. Please provide more content.' },
        { status: 400 }
      );
    }

    // Parse paper with LLM
    const { paper: parsedPaper, usage } = await parsePaperWithLLM(paperText);

    // Use metadata title if LLM didn't extract one
    if (!parsedPaper.title && metadata?.title) {
      parsedPaper.title = metadata.title;
    }

    // Generate summary for display
    const findingsSummary = summarizePaperFindings(parsedPaper);

    return NextResponse.json({
      success: true,
      parsedPaper,
      findingsSummary,
      source,
      tokenUsage: [usage],
    });
  } catch (error) {
    console.error('Parse paper error:', error);

    const message = error instanceof Error
      ? error.message
      : 'Failed to parse paper';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
