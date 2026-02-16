export const MODELS = {
  fast: 'claude-haiku-4-5-20251001',      // emergency scanning, summarization
  standard: 'claude-sonnet-4-5-20250929', // default conversation, greeting
  advanced: 'claude-opus-4-6',            // complex diagnostic reasoning
} as const;

export type ModelTier = keyof typeof MODELS;

export interface RouterContext {
  turnCount: number;
  sessionNotes: Record<string, unknown>;
  userMessage: string;
}

/**
 * Select the appropriate model for a conversation turn.
 *
 * Early turns use Sonnet for fast symptom gathering. Once the model has
 * recorded a chief_complaint and at least one symptom via update_session_notes,
 * we escalate to Opus for diagnostic reasoning.
 */
export function selectConversationModel(context: RouterContext): string {
  // Early conversation — greeting and initial symptom gathering
  if (context.turnCount <= 2) {
    return MODELS.standard;
  }

  // Escalate once we have enough clinical info for diagnostic reasoning
  const { sessionNotes } = context;
  const hasChiefComplaint = typeof sessionNotes.chief_complaint === 'string'
    && sessionNotes.chief_complaint.length > 0;
  const hasSymptoms = Array.isArray(sessionNotes.symptoms_noted)
    && sessionNotes.symptoms_noted.length > 0;

  if (hasChiefComplaint && hasSymptoms) {
    return MODELS.advanced;
  }

  return MODELS.standard;
}
