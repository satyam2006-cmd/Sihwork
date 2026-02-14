import { getAnthropicClient } from './client';
import { ExtractionEvalSchema, ConversationEvalSchema, type ExtractionEval, type ConversationEval } from '../schemas/eval-schemas';
import { EXTRACTION_EVAL_SYSTEM_PROMPT } from '../prompts/eval-extraction-prompt';
import { CONVERSATION_EVAL_SYSTEM_PROMPT } from '../prompts/eval-conversation-prompt';
import type { ChatMessage } from '../types/index';
import type { VisitExtraction } from '../schemas/visit-extraction';

export async function evaluateExtraction(
  transcript: ChatMessage[],
  extraction: VisitExtraction,
): Promise<ExtractionEval> {
  const client = getAnthropicClient();
  const transcriptText = transcript.map(m => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.content}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: EXTRACTION_EVAL_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `TRANSCRIPT:\n${transcriptText}\n\nEXTRACTED DATA:\n${JSON.stringify(extraction, null, 2)}`
    }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') throw new Error('No response');
  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return ExtractionEvalSchema.parse(JSON.parse(jsonStr));
}

export async function evaluateConversation(
  transcript: ChatMessage[],
): Promise<ConversationEval> {
  const client = getAnthropicClient();
  const transcriptText = transcript.map(m => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.content}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: CONVERSATION_EVAL_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `TRANSCRIPT:\n${transcriptText}` }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') throw new Error('No response');
  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return ConversationEvalSchema.parse(JSON.parse(jsonStr));
}

export function shouldWriteToEHR(eval_result: ExtractionEval): 'write' | 'write_with_review' | 'skip' {
  if (eval_result.overall_confidence >= 0.8) return 'write';
  if (eval_result.overall_confidence >= 0.5) return 'write_with_review';
  return 'skip';
}
