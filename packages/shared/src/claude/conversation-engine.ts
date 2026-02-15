import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from './client';
import { buildSystemPrompt, type EHRContext } from '../prompts/system-prompt';
import { compactIfNeeded } from '../context/compaction';
import { estimateTokens } from '../context/token-budget';
import type { ChatMessage } from '../types/index';

// Conversation-time tool definitions for Claude tool_use
const CONVERSATION_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_patient_context',
    description: 'Retrieve the current patient\'s medical information including allergies, conditions, medications, and recent documents. Use this when you need to reference specific details about the patient during the conversation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific fields to retrieve: allergies, conditions, medications, documents, demographics',
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'flag_emergency',
    description: 'Flag this consultation as an emergency. Use this when the patient describes symptoms that require immediate medical attention: chest pain with shortness of breath, sudden severe headache, signs of stroke, severe allergic reaction, active suicidal ideation, severe bleeding or trauma, loss of consciousness.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description: 'Brief description of the emergency',
        },
        severity: {
          type: 'string',
          enum: ['urgent', 'critical'],
          description: 'Severity level',
        },
        recommended_action: {
          type: 'string',
          description: 'What the patient should do immediately (e.g., "Call 112 immediately", "Go to nearest emergency room")',
        },
      },
      required: ['reason', 'severity', 'recommended_action'],
    },
  },
  {
    name: 'update_session_notes',
    description: 'Record progressive clinical notes during the consultation. Use this every few turns to capture key symptoms, observations, and preliminary assessments as they emerge.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chief_complaint: {
          type: 'string',
          description: 'The main reason for the visit (set once, early in conversation)',
        },
        symptoms_noted: {
          type: 'array',
          items: { type: 'string' },
          description: 'Symptoms mentioned so far',
        },
        severity_indicators: {
          type: 'array',
          items: { type: 'string' },
          description: 'Severity-related observations',
        },
        preliminary_assessment: {
          type: 'string',
          description: 'Current working assessment based on information so far',
        },
      },
      required: [],
    },
  },
];

const MAX_TOOL_LOOPS = 10;

export interface ConversationToolCallbacks {
  onEmergency?: (details: { reason: string; severity: string; recommended_action: string }) => void;
  onSessionNotes?: (notes: Record<string, unknown>) => void;
}

export class ConversationEngine {
  private client: Anthropic;
  private systemPrompt: string;
  private systemPromptTokens: number;
  private ehrContext: EHRContext;
  private messages: Anthropic.MessageParam[] = [];
  private isEmergency = false;
  private emergencyDetails: string | null = null;
  private sessionNotes: Record<string, unknown> = {};
  private callbacks: ConversationToolCallbacks;
  private conversationSummary: string | null = null;
  private createdAt: number;
  private messageTimestamps: Map<number, string> = new Map();

  constructor(ehrContext: EHRContext, callbacks?: ConversationToolCallbacks) {
    this.client = getAnthropicClient();
    this.ehrContext = ehrContext;
    this.systemPrompt = buildSystemPrompt(ehrContext);
    this.systemPromptTokens = estimateTokens(this.systemPrompt);
    this.callbacks = callbacks || {};
    this.createdAt = Date.now();
  }

  async getGreeting(): Promise<{ content: string; isEmergency: boolean }> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: 'Please greet me and start the consultation. Introduce yourself briefly and ask what brings me in today.',
          },
        ],
        // No tools for greeting — keep it simple
      });

      const textContent = response.content.find(c => c.type === 'text');
      const content = textContent && textContent.type === 'text' ? textContent.text : '';

      // Store as if user initiated
      this.messages.push({ role: 'user', content: '[Session started]' });
      this.recordTimestamp(this.messages.length - 1);
      this.messages.push({ role: 'assistant', content });
      this.recordTimestamp(this.messages.length - 1);

      return { content, isEmergency: false };
    } catch (error) {
      console.error('Greeting generation failed:', error);
      const fallback = 'Hello! I\'m your AI medical assistant. What brings you in today?';
      this.messages.push({ role: 'user', content: '[Session started]' });
      this.recordTimestamp(this.messages.length - 1);
      this.messages.push({ role: 'assistant', content: fallback });
      this.recordTimestamp(this.messages.length - 1);
      return { content: fallback, isEmergency: false };
    }
  }

  /**
   * Compact messages if they exceed the token budget.
   * Mutates this.messages and this.conversationSummary in place.
   */
  private async maybeCompact(): Promise<void> {
    const { messages, summary, wasCompacted } = await compactIfNeeded(
      this.messages,
      this.systemPromptTokens,
      this.conversationSummary,
    );
    if (wasCompacted) {
      this.messages = messages;
      this.conversationSummary = summary;
    }
  }

  async sendMessage(userMessage: string): Promise<{
    content: string;
    isEmergency: boolean;
    emergencyDetails: string | null;
  }> {
    this.messages.push({ role: 'user', content: userMessage });
    this.recordTimestamp(this.messages.length - 1);

    // Compact before API call if needed
    await this.maybeCompact();

    // Tool_use loop: send → handle tool calls → repeat until end_turn
    let finalContent = '';
    let loopCount = 0;

    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1024,
          system: this.systemPrompt,
          messages: this.messages,
          tools: CONVERSATION_TOOLS,
        });
      } catch (error) {
        console.error('Claude API error in sendMessage:', error);
        // Remove the user message we added since we can't process it
        this.messages.pop();
        throw new Error('AI service temporarily unavailable. Please try again.');
      }

      if (response.stop_reason === 'tool_use') {
        // Collect all content blocks (text + tool_use)
        this.messages.push({ role: 'assistant', content: response.content });

        // Process each tool call
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            try {
              const result = this.executeConversationTool(block.name, block.input as Record<string, unknown>);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
              });
            } catch (toolError) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ error: String(toolError) }),
                is_error: true,
              });
            }
          }
        }

        if (toolResults.length > 0) {
          this.messages.push({ role: 'user', content: toolResults });
        }
      } else if (response.stop_reason === 'max_tokens') {
        // Response was truncated — extract what we have and warn
        const textBlocks = response.content.filter(c => c.type === 'text');
        finalContent = textBlocks.map(c => c.type === 'text' ? c.text : '').join('');
        finalContent += '\n\n[I was cut off. Could you ask me to continue?]';
        this.messages.push({ role: 'assistant', content: finalContent });
        this.recordTimestamp(this.messages.length - 1);
        break;
      } else {
        // end_turn — extract text content
        const textBlocks = response.content.filter(c => c.type === 'text');
        finalContent = textBlocks.map(c => c.type === 'text' ? c.text : '').join('');
        this.messages.push({ role: 'assistant', content: finalContent });
        this.recordTimestamp(this.messages.length - 1);
        break;
      }
    }

    return {
      content: finalContent,
      isEmergency: this.isEmergency,
      emergencyDetails: this.emergencyDetails,
    };
  }

  async *sendMessageStreaming(userMessage: string): AsyncGenerator<{
    type: 'text' | 'done';
    content: string;
    isEmergency?: boolean;
    emergencyDetails?: string | null;
  }> {
    this.messages.push({ role: 'user', content: userMessage });
    this.recordTimestamp(this.messages.length - 1);

    // Compact before API call if needed
    await this.maybeCompact();

    let finalContent = '';
    let needsToolLoop = true;
    let loopCount = 0;

    while (needsToolLoop && loopCount < MAX_TOOL_LOOPS) {
      needsToolLoop = false;
      loopCount++;

      let stream: ReturnType<typeof this.client.messages.stream>;
      try {
        stream = this.client.messages.stream({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1024,
          system: this.systemPrompt,
          messages: this.messages,
          tools: CONVERSATION_TOOLS,
        });
      } catch (error) {
        console.error('Claude API error in sendMessageStreaming:', error);
        this.messages.pop();
        throw new Error('AI service temporarily unavailable. Please try again.');
      }

      let currentText = '';

      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              currentText += event.delta.text;
              yield { type: 'text', content: event.delta.text };
            }
          }
        }
      } catch (error) {
        console.error('Claude streaming error:', error);
        this.messages.pop();
        throw new Error('AI service connection lost. Please try again.');
      }

      // Get final message to check for tool use
      let finalMessage: Anthropic.Message;
      try {
        finalMessage = await stream.finalMessage();
      } catch (error) {
        console.error('Failed to get final message from stream:', error);
        // Use whatever text we collected so far
        if (currentText) {
          this.messages.push({ role: 'assistant', content: currentText });
          this.recordTimestamp(this.messages.length - 1);
          finalContent = currentText;
        }
        break;
      }

      if (finalMessage.stop_reason === 'tool_use') {
        // Process tool calls silently (no streaming for tool execution)
        this.messages.push({ role: 'assistant', content: finalMessage.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            try {
              const result = this.executeConversationTool(block.name, block.input as Record<string, unknown>);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
              });
            } catch (toolError) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ error: String(toolError) }),
                is_error: true,
              });
            }
          }
        }

        if (toolResults.length > 0) {
          this.messages.push({ role: 'user', content: toolResults });
        }
        needsToolLoop = true;
        currentText = ''; // Reset for next iteration
      } else {
        finalContent = currentText;
        this.messages.push({ role: 'assistant', content: finalContent });
        this.recordTimestamp(this.messages.length - 1);
      }
    }

    yield {
      type: 'done',
      content: finalContent,
      isEmergency: this.isEmergency,
      emergencyDetails: this.emergencyDetails,
    };
  }

  private executeConversationTool(name: string, input: Record<string, unknown>): unknown {
    switch (name) {
      case 'get_patient_context': {
        const fields = (input.fields as string[]) || [];
        const context: Record<string, unknown> = {};
        const p = this.ehrContext.patient;

        for (const field of fields) {
          switch (field) {
            case 'allergies': context.allergies = p.allergies; break;
            case 'conditions': context.chronic_conditions = p.chronic_conditions; break;
            case 'medications': context.current_medications = p.current_medications; break;
            case 'demographics': context.demographics = {
              full_name: p.full_name,
              date_of_birth: p.date_of_birth,
              gender: p.gender,
              blood_type: p.blood_type,
            }; break;
            case 'documents': context.documents = this.ehrContext.documents.map(d => ({
              file_name: d.file_name,
              uploaded_at: d.uploaded_at,
              extracted_data: d.extracted_data,
            })); break;
          }
        }

        return context;
      }

      case 'flag_emergency': {
        this.isEmergency = true;
        this.emergencyDetails = JSON.stringify(input);
        try {
          this.callbacks.onEmergency?.(input as { reason: string; severity: string; recommended_action: string });
        } catch (e) {
          console.error('onEmergency callback error:', e);
        }
        return { flagged: true, message: 'Emergency flagged successfully' };
      }

      case 'update_session_notes': {
        this.sessionNotes = { ...this.sessionNotes, ...input };
        try {
          this.callbacks.onSessionNotes?.(this.sessionNotes);
        } catch (e) {
          console.error('onSessionNotes callback error:', e);
        }
        return { updated: true };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  private recordTimestamp(index: number): void {
    this.messageTimestamps.set(index, new Date().toISOString());
  }

  getTranscript(): ChatMessage[] {
    // Flatten the multi-block messages into simple text messages
    const result: ChatMessage[] = [];
    let index = 0;

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
      // Use recorded timestamp if available, fallback to now
      const timestamp = this.messageTimestamps.get(i) || new Date().toISOString();

      if (typeof msg.content === 'string') {
        result.push({
          id: `msg-${index++}`,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp,
        });
      } else if (Array.isArray(msg.content)) {
        // Extract text from content blocks, skip tool_use and tool_result blocks
        const textParts: string[] = [];
        for (const block of msg.content) {
          if ('type' in block) {
            if (block.type === 'text') {
              textParts.push(block.text);
            }
            // Skip tool_use, tool_result blocks — not user-visible
          }
        }
        if (textParts.length > 0) {
          result.push({
            id: `msg-${index++}`,
            role: msg.role as 'user' | 'assistant',
            content: textParts.join(''),
            timestamp,
          });
        }
      }
    }

    return result;
  }

  getIsEmergency(): boolean {
    return this.isEmergency;
  }

  getSessionNotes(): Record<string, unknown> {
    return this.sessionNotes;
  }

  getCreatedAt(): number {
    return this.createdAt;
  }

  /**
   * Clean up resources. Call when the session is done.
   */
  destroy(): void {
    this.messages = [];
    this.conversationSummary = null;
    this.sessionNotes = {};
    this.messageTimestamps.clear();
  }
}
