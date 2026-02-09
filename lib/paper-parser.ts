import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadPromptWithVariables } from './prompt-loader';
import { ParsedPaperSchema, type ParsedPaper } from './types/paper';
import { extractUsage, type LLMCallUsage } from './token-tracker';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.warn('GOOGLE_API_KEY not set - paper parsing will fail');
}

/**
 * Parse paper text using Gemini Flash to extract structured data.
 * When pdfBase64 is provided, sends the PDF as multimodal input for figure/table extraction.
 */
export async function parsePaperWithLLM(paperText: string, pdfBase64?: string): Promise<{ paper: ParsedPaper; usage: LLMCallUsage }> {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent extraction
      responseMimeType: 'application/json',
    },
  });

  // Truncate paper text if too long (keep first 50k characters)
  const maxLength = 50000;
  const truncatedText = paperText.length > maxLength
    ? paperText.substring(0, maxLength) + '\n\n[Text truncated...]'
    : paperText;

  const prompt = loadPromptWithVariables('paper/parse_paper', {
    PAPER_TEXT: truncatedText,
  });

  try {
    // Use multimodal input when PDF is available
    let result;
    if (pdfBase64) {
      result = await model.generateContent([
        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
        { text: prompt },
      ]);
    } else {
      result = await model.generateContent(prompt);
    }
    const usage = extractUsage(result.response, 'Parse Paper');
    const responseText = result.response.text().trim();

    // Parse JSON response
    let parsed: any;
    try {
      // Clean markdown code blocks if present
      const cleaned = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      // Try to extract JSON object using regex
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }

    // Validate with Zod schema
    const validated = ParsedPaperSchema.parse(parsed);
    return { paper: validated, usage };
  } catch (error) {
    console.error('Error parsing paper:', error);
    if (error instanceof Error) {
      throw new Error(`Paper parsing failed: ${error.message}`);
    }
    throw new Error('Paper parsing failed');
  }
}

/**
 * Extract key findings summary for display
 */
export function summarizePaperFindings(paper: ParsedPaper): string {
  const parts: string[] = [];

  if (paper.keyFindings.hazardRatio) {
    parts.push(`HR: ${paper.keyFindings.hazardRatio}`);
  }

  if (paper.keyFindings.relativeRiskReduction) {
    parts.push(`RRR: ${(paper.keyFindings.relativeRiskReduction * 100).toFixed(0)}%`);
  }

  if (paper.keyFindings.absoluteRiskReduction) {
    parts.push(`ARR: ${(paper.keyFindings.absoluteRiskReduction * 100).toFixed(1)}%`);
  }

  if (paper.keyFindings.nnt) {
    parts.push(`NNT: ${paper.keyFindings.nnt}`);
  }

  return parts.join(' | ') || 'See detailed findings';
}
