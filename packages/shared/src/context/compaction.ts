import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from '../claude/client';
import { TOKEN_BUDGET, estimateMessagesTokens, estimateTokens } from './token-budget';

/** Number of recent turns to always keep verbatim */
const KEEP_RECENT_TURNS = 10;

/**
 * Extract plain text from a message for summarization.
 * Strips tool_use / tool_result blocks — they've served their purpose.
 */
function messageToText(msg: Anthropic.MessageParam): string {
  const role = msg.role === 'user' ? 'Patient' : 'Doctor';

  if (typeof msg.content === 'string') {
    return `${role}: ${msg.content}`;
  }

  if (Array.isArray(msg.content)) {
    const parts: string[] = [];
    for (const block of msg.content) {
      if ('type' in block) {
        if (block.type === 'text') {
          parts.push(block.text);
        }
        // Skip tool_use and tool_result blocks
      }
    }
    if (parts.length > 0) {
      return `${role}: ${parts.join(' ')}`;
    }
  }

  return '';
}

/**
 * Summarize older conversation turns into a compact clinical summary.
 * Uses a fast model call to produce ~200 tokens.
 */
async function summarizeMessages(messages: Anthropic.MessageParam[]): Promise<string> {
  const transcript = messages
    .map(messageToText)
    .filter(Boolean)
    .join('\n');

  if (!transcript.trim()) {
    return 'No substantive conversation occurred in earlier turns.';
  }

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 300,
    system: `You are a medical conversation summarizer. Produce a concise clinical summary of the conversation so far. Include: chief complaint, key symptoms discussed, any assessments made, and important patient history mentioned. Keep it under 200 words. Output ONLY the summary, no preamble.`,
    messages: [
      {
        role: 'user',
        content: `Summarize this doctor-patient conversation:\n\n${transcript}`,
      },
    ],
  });

  const text = response.content.find(c => c.type === 'text');
  return text && text.type === 'text' ? text.text : 'Earlier conversation covered initial symptoms and history.';
}

/**
 * Check whether the conversation needs compaction and perform it if so.
 *
 * Returns the (possibly compacted) messages array and the cached summary.
 *
 * Strategy:
 * - Keep last KEEP_RECENT_TURNS messages verbatim
 * - Summarize everything older into a single "[Conversation summary]" block
 * - Prepend the summary as a user + assistant turn pair
 */
export async function compactIfNeeded(
  messages: Anthropic.MessageParam[],
  systemPromptTokens: number,
  existingSummary: string | null,
): Promise<{
  messages: Anthropic.MessageParam[];
  summary: string | null;
  wasCompacted: boolean;
}> {
  const messagesTokens = estimateMessagesTokens(messages);
  const totalTokens = systemPromptTokens + messagesTokens + TOKEN_BUDGET.response;

  if (totalTokens <= TOKEN_BUDGET.total && messagesTokens <= TOKEN_BUDGET.conversation) {
    return { messages, summary: existingSummary, wasCompacted: false };
  }

  // Not enough messages to compact
  if (messages.length <= KEEP_RECENT_TURNS) {
    return { messages, summary: existingSummary, wasCompacted: false };
  }

  // Find the split point — ensure recentMessages starts with a user message
  // so the summary pair + recent messages maintain alternating roles
  let splitIndex = messages.length - KEEP_RECENT_TURNS;
  while (splitIndex < messages.length && messages[splitIndex].role !== 'user') {
    splitIndex++;
  }

  // If we can't find a good split, keep all messages
  if (splitIndex >= messages.length - 2) {
    return { messages, summary: existingSummary, wasCompacted: false };
  }

  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // Build the text to summarize: existing summary + older messages
  const olderForSummary: Anthropic.MessageParam[] = [];
  if (existingSummary) {
    olderForSummary.push(
      { role: 'user', content: `[Previous conversation summary]: ${existingSummary}` },
    );
  }
  olderForSummary.push(...olderMessages);

  const summary = await summarizeMessages(olderForSummary);

  // Rebuild messages: summary pair + recent verbatim turns
  // recentMessages is guaranteed to start with user role (from split logic above)
  const compactedMessages: Anthropic.MessageParam[] = [
    { role: 'user', content: `[Conversation summary so far]: ${summary}` },
    { role: 'assistant', content: 'I understand. Let me continue from where we left off.' },
    ...recentMessages,
  ];

  return { messages: compactedMessages, summary, wasCompacted: true };
}

/**
 * Compact a plain-text transcript (ChatMessage[]) for the post-session agent.
 * If the transcript text exceeds maxTokens, summarize the older portion.
 */
export async function compactTranscript(
  transcriptText: string,
  maxTokens: number = 50_000,
): Promise<string> {
  const tokens = estimateTokens(transcriptText);
  if (tokens <= maxTokens) {
    return transcriptText;
  }

  // Split into lines and keep ~60% from the end verbatim
  const lines = transcriptText.split('\n');
  const keepLines = Math.floor(lines.length * 0.6);
  const olderLines = lines.slice(0, lines.length - keepLines);
  const recentLines = lines.slice(lines.length - keepLines);

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    system: 'You are a medical conversation summarizer. Produce a concise clinical summary of the earlier portion of a doctor-patient conversation. Include: chief complaint, symptoms discussed, assessments, and key patient history. Keep it under 300 words. Output ONLY the summary.',
    messages: [
      {
        role: 'user',
        content: `Summarize the earlier portion of this conversation:\n\n${olderLines.join('\n')}`,
      },
    ],
  });

  const text = response.content.find(c => c.type === 'text');
  const summary = text && text.type === 'text' ? text.text : 'Earlier conversation covered initial symptoms and history.';

  return `[SUMMARY OF EARLIER CONVERSATION]\n${summary}\n\n[RECENT CONVERSATION - VERBATIM]\n${recentLines.join('\n')}`;
}
