// Supabase
export { createBrowserClient } from './supabase/client';
export { createServiceClient } from './supabase/server';

// Claude
export { getAnthropicClient } from './claude/client';
export { extractDocument } from './claude/document-extractor';
export { ConversationEngine } from './claude/conversation-engine';
export type { ConversationToolCallbacks, ConversationEngineOptions } from './claude/conversation-engine';
export { MODELS, selectConversationModel } from './claude/model-router';
export type { ModelTier, RouterContext } from './claude/model-router';

// Sarvam
export { speechToText } from './sarvam/asr';
export { textToSpeech } from './sarvam/tts';

// Schemas
export { DocumentExtractionSchema, LabResultSchema, MedicationSchema, DiagnosisSchema } from './schemas/document-extraction';
export { VisitExtractionSchema, SymptomSchema, VitalsSchema, RecommendationSchema } from './schemas/visit-extraction';
export { ExtractionEvalSchema, ConversationEvalSchema } from './schemas/eval-schemas';
export { PatientSchema, DocumentSchema, SessionSchema } from './schemas/database';
export {
  SOAPNoteSchema, EHREntrySchema, ClinicalLetterSchema,
  DiagnosisICDSchema, ProcedureCPTSchema, OrderSchema, PrescriptionSchema, ReviewOfSystemsSchema,
} from './schemas/clinical-documents';

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
export type {
  SOAPNote, EHREntry, ClinicalLetter,
  DiagnosisICD, ProcedureCPT, Order, Prescription, ReviewOfSystems,
} from './schemas/clinical-documents';

// Prompts
export { DOCUMENT_EXTRACTION_SYSTEM_PROMPT } from './prompts/extraction-prompt';
export { buildSystemPrompt } from './prompts/system-prompt';
export type { EHRContext } from './prompts/system-prompt';
export { SESSION_SUMMARY_SYSTEM_PROMPT } from './prompts/summary-prompt';
export { SOAP_NOTE_SYSTEM_PROMPT } from './prompts/soap-note-prompt';
export { EHR_ENTRY_SYSTEM_PROMPT } from './prompts/ehr-entry-prompt';
export { CLINICAL_LETTER_SYSTEM_PROMPT, buildLetterContext } from './prompts/clinical-letter-prompt';
export type { LetterContextParams } from './prompts/clinical-letter-prompt';

// EHR
export { hydrateEHRContext } from './ehr/hydration';
export { serializeEHRContext } from './ehr/serialize';

// Context Management
export { TOKEN_BUDGET, estimateTokens, estimateMessagesTokens, countTokens } from './context/token-budget';
export { compactIfNeeded, compactTranscript } from './context/compaction';

export { EmergencyScanner } from './claude/emergency-scanner';
export type { EmergencyScanResult } from './claude/emergency-scanner';
export { extractVisitData } from './claude/visit-extractor';
export { evaluateExtraction, evaluateConversation, shouldWriteToEHR } from './claude/eval-harness';
export { VISIT_EXTRACTION_SYSTEM_PROMPT } from './prompts/visit-extraction-prompt';
export { EXTRACTION_EVAL_SYSTEM_PROMPT } from './prompts/eval-extraction-prompt';
export { CONVERSATION_EVAL_SYSTEM_PROMPT } from './prompts/eval-conversation-prompt';
