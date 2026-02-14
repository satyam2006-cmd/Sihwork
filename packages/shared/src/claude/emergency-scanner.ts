import { getAnthropicClient } from './client';
import type { ChatMessage } from '../types/index';

const EMERGENCY_SCAN_PROMPT = `You are an emergency triage scanner. Analyze the patient's recent messages for signs of a medical emergency.

Flag as emergency if the patient describes ANY of these:
- Chest pain, especially with shortness of breath, sweating, or arm/jaw pain
- Signs of stroke: sudden numbness/weakness on one side, confusion, trouble speaking or seeing, severe headache
- Difficulty breathing or choking
- Severe allergic reaction (anaphylaxis): throat swelling, difficulty breathing, rapid pulse
- Active suicidal ideation or self-harm intent
- Severe bleeding or major trauma
- Loss of consciousness or seizure
- Symptoms of heart attack
- Severe abdominal pain with fever (possible appendicitis/peritonitis)
- Signs of sepsis: high fever with confusion, rapid breathing

Respond with ONLY valid JSON:
{
  "is_emergency": true/false,
  "reason": "brief explanation if emergency, null otherwise",
  "severity": "critical|urgent|null",
  "recommended_action": "e.g. 'Call 911 immediately' or null"
}`;

export interface EmergencyScanResult {
  isEmergency: boolean;
  reason?: string;
  severity?: 'critical' | 'urgent';
  recommended_action?: string;
}

/**
 * Lightweight parallel emergency scanner using Haiku for sub-second latency.
 * Defense-in-depth — does NOT replace the main agent's `flag_emergency` tool.
 * All errors are caught silently; scanner failure must NEVER crash the main flow.
 */
export class EmergencyScanner {
  /**
   * Scan recent messages for emergency indicators.
   * @param messages - Full message history (only the last `maxMessages` are examined)
   * @param maxMessages - Number of recent messages to scan (default 3)
   */
  async scan(messages: ChatMessage[], maxMessages = 3): Promise<EmergencyScanResult> {
    try {
      // Only look at the most recent user messages for speed
      const recentUserMessages = messages
        .filter(m => m.role === 'user')
        .slice(-maxMessages);

      if (recentUserMessages.length === 0) {
        return { isEmergency: false };
      }

      const client = getAnthropicClient();
      const content = recentUserMessages
        .map(m => `Patient: ${m.content}`)
        .join('\n');

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: EMERGENCY_SCAN_PROMPT,
        messages: [{ role: 'user', content }],
      });

      const textBlock = response.content.find(c => c.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return { isEmergency: false };
      }

      let jsonStr = textBlock.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      return {
        isEmergency: parsed.is_emergency === true,
        reason: parsed.reason || undefined,
        severity: parsed.severity || undefined,
        recommended_action: parsed.recommended_action || undefined,
      };
    } catch {
      // Scanner failure must never crash the main flow
      return { isEmergency: false };
    }
  }
}
