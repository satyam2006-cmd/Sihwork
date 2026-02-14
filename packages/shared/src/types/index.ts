export type { Patient, Document, Session } from '../schemas/database';
export type { DocumentExtraction, LabResult, Medication, Diagnosis } from '../schemas/document-extraction';
export type { VisitExtraction, Symptom, Vitals, Recommendation } from '../schemas/visit-extraction';
export type { ExtractionEval, ConversationEval } from '../schemas/eval-schemas';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  language?: string;
}

export interface ConversationState {
  sessionId: string;
  patientId: string;
  messages: ChatMessage[];
  isEmergency: boolean;
  emergencyDetails?: string;
  mode: 'text' | 'voice';
  language: string;
}

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface WSMessage {
  type: 'audio' | 'transcript' | 'status' | 'error' | 'greeting' | 'emergency';
  data?: unknown;
  text?: string;
  audio?: string; // base64 encoded
  language?: string;
  sessionId?: string;
}
