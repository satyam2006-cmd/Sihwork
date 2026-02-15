import Anthropic from '@anthropic-ai/sdk';
import { FHIRClient } from './fhir-client';
import { buildFHIRTools } from './fhir-tools';
import { buildSystemPrompt } from './system-prompt';
import type { AgentResult, ToolCallRecord, MedAgentTask } from './types';

/**
 * Run the multi-turn tool_use agent loop for a single MedAgentBench task.
 *
 * Follows the same pattern as conversation-engine.ts:175-239:
 * 1. Build system prompt with task instruction + context
 * 2. Send to Claude with FHIR tools
 * 3. On tool_use stop: execute FHIR call, return result
 * 4. On finish_task: extract answer, terminate loop
 * 5. On end_turn without tools: nudge Claude to use tools
 * 6. Max rounds and timeout enforced
 */
export async function runAgentLoop(
  task: MedAgentTask,
  fhirClient: FHIRClient,
  model: string,
  maxRounds: number,
  timeoutMs: number = 60_000,
): Promise<AgentResult> {
  const client = new Anthropic();
  const { tools, handlers } = buildFHIRTools(fhirClient);
  const systemPrompt = buildSystemPrompt(task.instruction, task.context);

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Please complete the following clinical task. The patient FHIR ID is: ${task.patient_id}\n\nTask: ${task.instruction}`,
    },
  ];

  const toolCalls: ToolCallRecord[] = [];
  let answer: string | null = null;
  let rounds = 0;
  let timedOut = false;

  const deadline = Date.now() + timeoutMs;

  while (rounds < maxRounds) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }

    rounds++;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        tools,
      });
    } catch (error) {
      return {
        answer: null,
        rounds,
        toolCalls,
        timedOut: false,
        error: `Claude API error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (response.stop_reason === 'tool_use') {
      // Collect all content blocks (text + tool_use) — same as conversation-engine
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const input = block.input as Record<string, unknown>;

        // Check for finish_task — terminates the loop
        if (block.name === 'finish_task') {
          answer = (input.answer as string) ?? '';
          toolCalls.push({ tool: 'finish_task', input, output: { status: 'finished' } });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ status: 'finished', answer }),
          });
          // Push tool results then break
          messages.push({ role: 'user', content: toolResults });
          return { answer, rounds, toolCalls, timedOut: false };
        }

        // Execute FHIR tool
        const handler = handlers[block.name];
        if (!handler) {
          const errResult = { error: `Unknown tool: ${block.name}` };
          toolCalls.push({ tool: block.name, input, output: errResult });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(errResult),
            is_error: true,
          });
          continue;
        }

        try {
          const result = await handler(input);
          toolCalls.push({ tool: block.name, input, output: result });
          // Truncate large FHIR responses to avoid context overflow
          const resultStr = JSON.stringify(result);
          const truncated = resultStr.length > 8000
            ? resultStr.slice(0, 8000) + '... [truncated]'
            : resultStr;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: truncated,
          });
        } catch (err) {
          const errResult = { error: err instanceof Error ? err.message : String(err) };
          toolCalls.push({ tool: block.name, input, output: errResult });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(errResult),
            is_error: true,
          });
        }
      }

      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }
    } else if (response.stop_reason === 'end_turn') {
      // Claude stopped without using tools — extract any text and nudge
      const textBlocks = response.content.filter(c => c.type === 'text');
      const text = textBlocks.map(c => c.type === 'text' ? c.text : '').join('');

      // If Claude gave a text response, it might contain the answer
      // but we need it to call finish_task. Nudge it.
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: 'Please call the finish_task tool with your final answer. Do not respond with text only — you must use the finish_task tool.',
      });

      // If this is the last round, treat the text as the answer
      if (rounds >= maxRounds - 1) {
        answer = text;
      }
    } else {
      // max_tokens or other stop — break
      break;
    }
  }

  return {
    answer,
    rounds,
    toolCalls,
    timedOut: timedOut || rounds >= maxRounds,
  };
}
