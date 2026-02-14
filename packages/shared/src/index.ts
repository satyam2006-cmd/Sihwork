// Supabase
export { createBrowserClient } from './supabase/client';
export { createServiceClient } from './supabase/server';

// Claude
export { getAnthropicClient } from './claude/client';
export { extractDocument } from './claude/document-extractor';
export { ConversationEngine } from './claude/conversation-engine';
export type { ConversationToolCallbacks } from './claude/conversation-engine';

// Sarvam
export { speechToText } from './sarvam/asr';
export { textToSpeech } from './sarvam/tts';

// Schemas
export { DocumentExtractionSchema, LabResultSchema, MedicationSchema, DiagnosisSchema } from './schemas/document-extraction';
export { VisitExtractionSchema, SymptomSchema, VitalsSchema, RecommendationSchema } from './schemas/visit-extraction';
export { ExtractionEvalSchema, ConversationEvalSchema } from './schemas/eval-schemas';
export { PatientSchema, DocumentSchema, SessionSchema } from './schemas/database';

// Types
export type {
  ChatMessage,
  ConversationState,
  SessionStatus,
  WSMessage,
  Patient,
  Document,
  Session,
  DocumentExtraction,
  LabResult,
  Medication,
  Diagnosis,
  VisitExtraction,
  Symptom,
  Vitals,
  Recommendation,
  ExtractionEval,
  ConversationEval,
} from './types/index';

// Prompts
export { DOCUMENT_EXTRACTION_SYSTEM_PROMPT } from './prompts/extraction-prompt';
export { buildSystemPrompt } from './prompts/system-prompt';
export type { EHRContext } from './prompts/system-prompt';
export { SESSION_SUMMARY_SYSTEM_PROMPT } from './prompts/summary-prompt';

// EHR
export { hydrateEHRContext } from './ehr/hydration';

export { extractVisitData } from './claude/visit-extractor';
export { evaluateExtraction, evaluateConversation, shouldWriteToEHR } from './claude/eval-harness';
export { VISIT_EXTRACTION_SYSTEM_PROMPT } from './prompts/visit-extraction-prompt';
export { EXTRACTION_EVAL_SYSTEM_PROMPT } from './prompts/eval-extraction-prompt';
export { CONVERSATION_EVAL_SYSTEM_PROMPT } from './prompts/eval-conversation-prompt';
