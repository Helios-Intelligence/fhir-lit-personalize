import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load a prompt from the specified path relative to /prompts directory
 * @param promptPath The path relative to prompts directory (e.g., 'paper/parse_paper')
 */
export function loadPrompt(promptPath: string): string {
  const promptFile = join(process.cwd(), 'prompts', `${promptPath}.txt`);

  try {
    return readFileSync(promptFile, 'utf-8').trim();
  } catch (error) {
    console.error(`Error loading prompt file ${promptPath}: ${error}`);
    throw new Error(`Failed to load prompt: ${promptPath}`);
  }
}

/**
 * Load and format a prompt with variable substitution
 * @param promptPath The path relative to prompts directory
 * @param variables Object containing variable names and their values
 */
export function loadPromptWithVariables(
  promptPath: string,
  variables: Record<string, string>
): string {
  let prompt = loadPrompt(promptPath);

  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return prompt;
}
