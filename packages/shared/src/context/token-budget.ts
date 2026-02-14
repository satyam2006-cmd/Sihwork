import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from '../claude/client';

/**
 * Token budget allocation for the 200K context window.
 * Each segment gets a fixed ceiling; the conversation segment flexes.
 */
export const TOKEN_BUDGET = {
  /** Hard ceiling — leave 20K headroom from the 200K window */
  total: 180_000,
  /** Fixed persona + rules text */
  system_prompt: 8_000,
  /** Patient demographics + document summaries + prior sessions */
  ehr_context: 20_000,
  /** Conversation messages (compacted when exceeded) */
  conversation: 140_000,
  /** Reserved for Claude's response */
  response: 12_000,
} as const;

/**
 * Fast heuristic: ~4 characters per token (works for English medical text).
 * Use this in hot paths where latency matters more than precision.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for an array of Anthropic message params.
 * Handles string content and content block arrays.
 */
export function estimateMessagesTokens(messages: Anthropic.MessageParam[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('text' in block && typeof block.text === 'string') {
          total += estimateTokens(block.text);
        } else if ('content' in block && typeof block.content === 'string') {
          // tool_result blocks
          total += estimateTokens(block.content);
        }
      }
    }
    // ~4 tokens overhead per message for role/formatting
    total += 4;
  }
  return total;
}

/**
 * Accurate token count via the Anthropic API.
 * Falls back to the estimate if the API call fails.
 */
export async function countTokens(
  messages: Anthropic.MessageParam[],
  systemPrompt?: string,
  tools?: Anthropic.Tool[],
): Promise<number> {
  try {
    const client = getAnthropicClient();
    const params: Anthropic.Messages.MessageCountTokensParams = {
      model: 'claude-sonnet-4-5-20250929',
      messages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(tools ? { tools } : {}),
    };
    const result = await client.messages.countTokens(params);
    return result.input_tokens;
  } catch {
    // Fallback to estimate
    let total = estimateMessagesTokens(messages);
    if (systemPrompt) total += estimateTokens(systemPrompt);
    return total;
  }
}
