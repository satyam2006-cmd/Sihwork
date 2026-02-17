// Shared types for MCP tool parameters and results

// ─── Patient Management ───

export interface GetPatientParams {
  patient_id?: string;
  user_id?: string;
  include_documents?: boolean;
  include_sessions?: boolean;
  include_session_stats?: boolean;
}

export interface GetPatientResult {
  patient: Record<string, unknown>;
  documents?: Record<string, unknown>[];
  sessions?: Record<string, unknown>[];
  session_stats?: { session_count: number; last_session_at: string | null };
}

export interface UpdatePatientParams {
  patient_id: string;
  // Direct field updates
  full_name?: string;
  date_of_birth?: string;
  gender?: string;
  phone?: string;
  blood_type?: string;
  emergency_contact?: Record<string, string>;
  // Merge arrays (dedup with existing)
  new_conditions?: string[];
  new_medications?: string[];
  new_allergies?: string[];
}

// ─── Session Management ───

export interface CreateSessionParams {
  patient_id: string;
  mode: 'text' | 'voice' | 'scribe';
  doctor_id?: string;
  language?: string;
}

export interface GetSessionParams {
  session_id: string;
  include_visit_record?: boolean;
  include_summary?: boolean;
  include_patient_name?: boolean;
  include_soap_note?: boolean;
  include_ehr_entry?: boolean;
  include_clinical_letters?: boolean;
  verify_owner_user_id?: string;
}

export interface GetSessionResult {
  session: Record<string, unknown>;
  visit_record?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
  patient_name?: string;
  soap_note?: Record<string, unknown> | null;
  ehr_entry?: Record<string, unknown> | null;
  clinical_letters?: Record<string, unknown>[];
}

export interface UpdateSessionParams {
  session_id: string;
  transcript?: unknown[];
  status?: 'active' | 'completed' | 'abandoned';
  language?: string;
  emergency_flagged?: boolean;
  emergency_details?: string | null;
  metadata?: Record<string, unknown>;
  complete?: boolean; // shorthand: sets status=completed + ended_at=now()
}

export interface DeleteSessionParams {
  session_id: string;
}

// ─── Clinical Records ───

export interface ListSessionsParams {
  patient_id?: string;
  include_patient_names?: boolean;
  include_review_status?: boolean;
  mode_filter?: string;
}

export interface WriteVisitRecordParams {
  session_id: string;
  patient_id: string;
  chief_complaint: string;
  symptoms: unknown[];
  vitals?: Record<string, unknown> | null;
  assessment: string;
  diagnoses: unknown[];
  recommendations: unknown[];
  follow_up?: string | null;
  red_flags?: string[];
  medication_changes?: unknown[];
  confidence_score: number;
  needs_review: boolean;
}

export interface WriteSessionSummaryParams {
  session_id: string;
  patient_id: string;
  summary_text: string;
  key_findings: string[];
  follow_up_items: string[];
}

export interface ReviewVisitRecordParams {
  session_id: string;
}

// ─── SOAP Notes ───

export interface WriteSOAPNoteParams {
  session_id: string;
  patient_id: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface UpdateSOAPNoteParams {
  soap_note_id: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  status?: 'draft' | 'edited' | 'finalized';
}

// ─── EHR Entries ───

export interface WriteEHREntryParams {
  session_id: string;
  patient_id: string;
  encounter_date?: string;
  encounter_type?: string;
  chief_complaint: string;
  history_of_present_illness: string;
  past_medical_history?: string;
  review_of_systems?: Record<string, string>;
  physical_exam?: string;
  assessment_and_plan: string;
  diagnoses_icd?: unknown[];
  procedures_cpt?: unknown[];
  orders?: unknown[];
  prescriptions?: unknown[];
  follow_up_instructions?: string;
}

export interface UpdateEHREntryParams {
  ehr_entry_id: string;
  encounter_date?: string;
  encounter_type?: string;
  chief_complaint?: string;
  history_of_present_illness?: string;
  past_medical_history?: string;
  review_of_systems?: Record<string, string>;
  physical_exam?: string;
  assessment_and_plan?: string;
  diagnoses_icd?: unknown[];
  procedures_cpt?: unknown[];
  orders?: unknown[];
  prescriptions?: unknown[];
  follow_up_instructions?: string;
  status?: 'draft' | 'edited' | 'finalized';
}

// ─── Clinical Letters ───

export interface WriteClinicalLetterParams {
  session_id: string;
  patient_id: string;
  letter_type: string;
  recipient_name?: string;
  recipient_title?: string;
  recipient_institution?: string;
  subject_line: string;
  body: string;
  generated_by?: 'ai' | 'doctor';
}

export interface UpdateClinicalLetterParams {
  letter_id: string;
  letter_type?: string;
  recipient_name?: string;
  recipient_title?: string;
  recipient_institution?: string;
  subject_line?: string;
  body?: string;
  status?: 'draft' | 'edited' | 'finalized';
}

// ─── Documents ───

export interface ManageDocumentParams {
  action: 'create' | 'update_status' | 'get';
  // For create
  patient_id?: string;
  file_name?: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  // For update_status
  document_id?: string;
  status?: 'uploaded' | 'processing' | 'processed' | 'failed';
  extracted_data?: unknown;
  extracted_summary?: string;
  extraction_error?: string;
  // For get
  verify_owner_user_id?: string;
}
