import { NextRequest, NextResponse } from 'next/server';
import { parsePaperWithLLM, summarizePaperFindings } from '@/lib/paper-parser';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface ParsePaperRequest {
  paperText: string;
  source: 'pdf' | 'pmid' | 'doi';
}

export async function POST(request: NextRequest) {
  try {
    const body: ParsePaperRequest = await request.json();
    const { paperText, source } = body;

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
    const parsedPaper = await parsePaperWithLLM(paperText);

    // Generate summary for display
    const findingsSummary = summarizePaperFindings(parsedPaper);

    return NextResponse.json({
      success: true,
      parsedPaper,
      findingsSummary,
      source,
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
