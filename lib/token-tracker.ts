/**
 * Token usage tracking for LLM calls
 * Gemini 2.0 Flash pricing: $0.10/1M input, $0.40/1M output
 */

const MODEL_NAME = 'gemini-2.0-flash';
const INPUT_COST_PER_TOKEN = 0.10 / 1_000_000;  // $0.10 per 1M tokens
const OUTPUT_COST_PER_TOKEN = 0.40 / 1_000_000;  // $0.40 per 1M tokens

export interface LLMCallUsage {
  step: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export interface TokenUsageSummary {
  calls: LLMCallUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

/**
 * Extract usage metadata from a Gemini API response
 */
export function extractUsage(
  response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } },
  stepName: string
): LLMCallUsage {
  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const inputCost = inputTokens * INPUT_COST_PER_TOKEN;
  const outputCost = outputTokens * OUTPUT_COST_PER_TOKEN;

  return {
    step: stepName,
    model: MODEL_NAME,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Build a summary from multiple call usages
 */
export function buildUsageSummary(calls: LLMCallUsage[]): TokenUsageSummary {
  return {
    calls,
    totalInputTokens: calls.reduce((sum, c) => sum + c.inputTokens, 0),
    totalOutputTokens: calls.reduce((sum, c) => sum + c.outputTokens, 0),
    totalCost: calls.reduce((sum, c) => sum + c.totalCost, 0),
  };
}
