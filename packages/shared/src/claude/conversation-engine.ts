import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from './client';
import { buildSystemPrompt, type EHRContext } from '../prompts/system-prompt';
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

export interface ConversationToolCallbacks {
  onEmergency?: (details: { reason: string; severity: string; recommended_action: string }) => void;
  onSessionNotes?: (notes: Record<string, unknown>) => void;
}

export class ConversationEngine {
  private client: Anthropic;
  private systemPrompt: string;
  private ehrContext: EHRContext;
  private messages: Anthropic.MessageParam[] = [];
  private isEmergency = false;
  private emergencyDetails: string | null = null;
  private sessionNotes: Record<string, unknown> = {};
  private callbacks: ConversationToolCallbacks;

  constructor(ehrContext: EHRContext, callbacks?: ConversationToolCallbacks) {
    this.client = getAnthropicClient();
    this.ehrContext = ehrContext;
    this.systemPrompt = buildSystemPrompt(ehrContext);
    this.callbacks = callbacks || {};
  }

  async getGreeting(): Promise<{ content: string; isEmergency: boolean }> {
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
    this.messages.push({ role: 'assistant', content });

    return { content, isEmergency: false };
  }

  async sendMessage(userMessage: string): Promise<{
    content: string;
    isEmergency: boolean;
    emergencyDetails: string | null;
  }> {
    this.messages.push({ role: 'user', content: userMessage });

    // Tool_use loop: send → handle tool calls → repeat until end_turn
    let finalContent = '';

    while (true) {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: this.systemPrompt,
        messages: this.messages,
        tools: CONVERSATION_TOOLS,
      });

      if (response.stop_reason === 'tool_use') {
        // Collect all content blocks (text + tool_use)
        this.messages.push({ role: 'assistant', content: response.content });

        // Process each tool call
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = this.executeConversationTool(block.name, block.input as Record<string, unknown>);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }

        this.messages.push({ role: 'user', content: toolResults });
      } else {
        // end_turn — extract text content
        const textBlocks = response.content.filter(c => c.type === 'text');
        finalContent = textBlocks.map(c => c.type === 'text' ? c.text : '').join('');
        this.messages.push({ role: 'assistant', content: finalContent });
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

    let finalContent = '';
    let needsToolLoop = true;

    while (needsToolLoop) {
      needsToolLoop = false;

      const stream = this.client.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: this.systemPrompt,
        messages: this.messages,
        tools: CONVERSATION_TOOLS,
      });

      const contentBlocks: Anthropic.ContentBlock[] = [];
      let currentText = '';

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            currentText += event.delta.text;
            yield { type: 'text', content: event.delta.text };
          }
        } else if (event.type === 'content_block_stop') {
          // Collect completed blocks from the stream
        }
      }

      // Get final message to check for tool use
      const finalMessage = await stream.finalMessage();
      contentBlocks.push(...finalMessage.content);

      if (finalMessage.stop_reason === 'tool_use') {
        // Process tool calls silently (no streaming for tool execution)
        this.messages.push({ role: 'assistant', content: finalMessage.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            const result = this.executeConversationTool(block.name, block.input as Record<string, unknown>);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }

        this.messages.push({ role: 'user', content: toolResults });
        needsToolLoop = true;
        currentText = ''; // Reset for next iteration
      } else {
        finalContent = currentText;
      }
    }

    this.messages.push({ role: 'assistant', content: finalContent });

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
        this.callbacks.onEmergency?.(input as { reason: string; severity: string; recommended_action: string });
        return { flagged: true, message: 'Emergency flagged successfully' };
      }

      case 'update_session_notes': {
        this.sessionNotes = { ...this.sessionNotes, ...input };
        this.callbacks.onSessionNotes?.(this.sessionNotes);
        return { updated: true };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  getTranscript(): ChatMessage[] {
    // Flatten the multi-block messages into simple text messages
    const result: ChatMessage[] = [];
    let index = 0;

    for (const msg of this.messages) {
      if (typeof msg.content === 'string') {
        result.push({
          id: `msg-${index++}`,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date().toISOString(),
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
            timestamp: new Date().toISOString(),
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
}
