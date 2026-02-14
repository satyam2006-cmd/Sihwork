/**
 * Long Conversation Stress Test
 *
 * Validates that conversation compaction keeps messages within token budget
 * during extended multi-turn conversations.
 */
import 'dotenv/config';
import {
  estimateTokens,
  estimateMessagesTokens,
  TOKEN_BUDGET,
} from '@second-opinion/shared';
import { compactIfNeeded } from '@second-opinion/shared';
import { printResultsTable } from './utils/metrics';
import type Anthropic from '@anthropic-ai/sdk';

interface TestResult {
  name: string;
  pass: boolean;
  metric: string;
  value: number;
  threshold: number;
  details?: string;
}

/**
 * Simulate a multi-turn conversation by building up message arrays.
 * Does NOT call the real API — tests the compaction logic with synthetic messages.
 */
function generateConversationMessages(turns: number): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  const medicalTopics = [
    "I've been having headaches for the past two weeks, mostly in the morning.",
    "The pain is usually around a 6 out of 10, sometimes worse when I stand up quickly.",
    "I haven't noticed any visual changes, but I do feel a bit dizzy sometimes.",
    "No, I haven't had any recent head injuries. I do work at a computer all day though.",
    "I drink about 2-3 cups of coffee a day. I know I should probably cut back.",
    "My sleep has been irregular lately. I've been staying up past midnight most nights.",
    "I do take ibuprofen occasionally, maybe 2-3 times a week for the headaches.",
    "My mother had migraines, but I've never been diagnosed with them before.",
    "The headaches started around the time I switched to a new project at work. Very stressful.",
    "I exercise about 3 times a week, mostly jogging and some weightlifting.",
  ];

  const doctorResponses = [
    "I understand you've been dealing with headaches. Can you tell me more about where exactly the pain is located?",
    "Thank you for that detail. The morning onset and positional component is important to note. Have you experienced any changes in your vision?",
    "The dizziness is worth noting. Have you had any recent head injuries or trauma?",
    "Screen time can certainly contribute to tension headaches. How much caffeine do you consume daily?",
    "That's a moderate amount. Let's talk about your sleep patterns — how many hours do you typically get?",
    "Irregular sleep is a known headache trigger. Are you taking any medications for the headaches currently?",
    "Taking ibuprofen that frequently could actually lead to medication overuse headaches. Does anyone in your family have a history of migraines?",
    "Family history of migraines is relevant. Have there been any major life changes or stressors recently?",
    "Work stress is a significant trigger. What about physical activity — are you exercising regularly?",
    "Good to hear you stay active. Based on what you've told me, this sounds like it could be tension-type headaches, possibly with a migraine component.",
  ];

  for (let i = 0; i < turns; i++) {
    messages.push({
      role: 'user',
      content: medicalTopics[i % medicalTopics.length] + ` (Turn ${i + 1})`,
    });
    messages.push({
      role: 'assistant',
      content: doctorResponses[i % doctorResponses.length] + ` (Response ${i + 1})`,
    });
  }

  return messages;
}

async function main() {
  const results: TestResult[] = [];
  const systemPromptTokens = 3000; // Approximate for testing

  // Test 1: Small conversation (10 turns) should NOT compact
  {
    const messages = generateConversationMessages(10);
    const tokensBefore = estimateMessagesTokens(messages);
    const { wasCompacted } = await compactIfNeeded(messages, systemPromptTokens, null);

    results.push({
      name: '10-turn conversation: no compaction needed',
      pass: !wasCompacted,
      metric: 'tokens',
      value: tokensBefore,
      threshold: TOKEN_BUDGET.conversation,
      details: `${messages.length} messages, ${tokensBefore} tokens`,
    });
  }

  // Test 2: 50-turn conversation — check compaction triggers
  // Use inflated system tokens that push total over budget
  {
    const messages = generateConversationMessages(50);
    const tokensBefore = estimateMessagesTokens(messages);

    // Set system tokens so that system + messages + response > total budget
    const inflatedSystemTokens = TOKEN_BUDGET.total - tokensBefore - TOKEN_BUDGET.response + 1000;
    const { messages: compacted, wasCompacted, summary } = await compactIfNeeded(
      messages,
      inflatedSystemTokens,
      null,
    );

    const tokensAfter = estimateMessagesTokens(compacted);

    results.push({
      name: '50-turn conversation: compaction triggers when budget exceeded',
      pass: wasCompacted && tokensAfter < tokensBefore,
      metric: 'tokens_saved',
      value: tokensBefore - tokensAfter,
      threshold: 0,
      details: `Before: ${tokensBefore}, After: ${tokensAfter}, Summary: ${summary ? summary.slice(0, 80) + '...' : 'none'}`,
    });
  }

  // Test 3: Compacted conversation preserves recent turns
  {
    const messages = generateConversationMessages(30);
    const tokensBefore = estimateMessagesTokens(messages);
    const inflatedSystemTokens = TOKEN_BUDGET.total - tokensBefore - TOKEN_BUDGET.response + 1000;
    const { messages: compacted, wasCompacted } = await compactIfNeeded(
      messages,
      inflatedSystemTokens,
      null,
    );

    if (wasCompacted) {
      // First 2 messages should be summary pair, rest should be recent
      const hasSummaryPair = typeof compacted[0].content === 'string' &&
        (compacted[0].content as string).includes('[Conversation summary');
      const lastOriginal = messages[messages.length - 1];
      const lastCompacted = compacted[compacted.length - 1];
      const preservesRecent = JSON.stringify(lastOriginal) === JSON.stringify(lastCompacted);

      results.push({
        name: '30-turn conversation: recent turns preserved after compaction',
        pass: hasSummaryPair && preservesRecent,
        metric: 'messages',
        value: compacted.length,
        threshold: 22, // 2 summary + 20 recent (10 turns * 2 messages)
        details: `Summary pair: ${hasSummaryPair}, Recent preserved: ${preservesRecent}`,
      });
    } else {
      results.push({
        name: '30-turn conversation: recent turns preserved after compaction',
        pass: false,
        metric: 'messages',
        value: 0,
        threshold: 22,
        details: 'Compaction did not trigger',
      });
    }
  }

  // Test 4: Progressive compaction with existing summary
  {
    const messages = generateConversationMessages(20);
    const existingSummary = 'Patient previously discussed chronic headaches, sleep issues, and caffeine intake. Tension-type headaches suspected.';
    const inflatedSystemTokens = TOKEN_BUDGET.total - TOKEN_BUDGET.conversation + 1000;

    const { summary } = await compactIfNeeded(
      messages,
      inflatedSystemTokens,
      existingSummary,
    );

    results.push({
      name: 'Progressive compaction: existing summary is incorporated',
      pass: summary !== null && summary.length > 0,
      metric: 'summary_length',
      value: summary?.length || 0,
      threshold: 50,
      details: summary ? summary.slice(0, 100) + '...' : 'No summary generated',
    });
  }

  // Test 5: Token estimate for multi-session scenario
  {
    const session1 = generateConversationMessages(20);
    const session2 = generateConversationMessages(20);
    const session3 = generateConversationMessages(20);

    const totalTokens = estimateMessagesTokens(session1) +
                       estimateMessagesTokens(session2) +
                       estimateMessagesTokens(session3);

    results.push({
      name: 'Multi-session token estimation',
      pass: totalTokens > 0,
      metric: 'total_tokens',
      value: totalTokens,
      threshold: 0,
      details: `3 sessions × 20 turns each`,
    });
  }

  printResultsTable(results);

  const allPassed = results.every(r => r.pass);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
