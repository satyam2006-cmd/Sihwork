import { getAnthropicClient } from './client';
import { VisitExtractionSchema, type VisitExtraction } from '../schemas/visit-extraction';
import { VISIT_EXTRACTION_SYSTEM_PROMPT } from '../prompts/visit-extraction-prompt';
import type { ChatMessage } from '../types/index';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

export async function extractVisitData(
  transcript: ChatMessage[],
  ehrContext?: string,
  model?: string,
): Promise<VisitExtraction> {
  const client = getAnthropicClient();

  const transcriptText = transcript
    .map(m => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.content}`)
    .join('\n');

  const userContent = ehrContext
    ? `=== PRE-EXISTING PATIENT HISTORY (before today — reference only, do NOT extract as new) ===\n${ehrContext}\n\n=== TODAY'S CONSULTATION TRANSCRIPT (extract from THIS only) ===\n${transcriptText}`
    : `=== TODAY'S CONSULTATION TRANSCRIPT ===\n${transcriptText}`;

  const response = await client.messages.create({
    model: model || DEFAULT_MODEL,
    max_tokens: 4096,
    system: VISIT_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);
  return VisitExtractionSchema.parse(parsed);
}
