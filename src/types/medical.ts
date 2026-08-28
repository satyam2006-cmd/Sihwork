export type TriagePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type AppLanguageCode = 'gu-IN' | 'mr-IN' | 'hi-IN' | 'en-IN' | 'other';

export interface AppLanguage {
  code: AppLanguageCode;
  label: string;
  nativeLabel: string;
  chatgptName: string;
}

export type InterviewStage =
  | 'chief_complaint'
  | 'hpi_details'
  | 'red_flags'
  | 'past_history'
  | 'allergies'
  | 'chronic_conditions'
  | 'medications'
  | 'uploads'
  | 'complete';

export interface SpeechTurn {
  id: string;
  sender: 'ai' | 'patient';
  text: string;
  timestamp: string;
}

export type DocumentType = 'prescription' | 'lab_report' | 'discharge_summary';
export type DocumentSourceKind = 'printed_ocr' | 'handwritten_gemma' | 'uploaded_file';

export interface ScannedDoc {
  id: string;
  name: string;
  type: DocumentType;
  uploadedAt: string;
  rawText: string;
  imagePreview?: string; // data URL of uploaded document image/PDF preview
  filePreview?: string; // object URL for PDFs or other files that should open in dashboard
  mimeType?: string;
  sourceKind?: DocumentSourceKind;
  ocrConfidence?: number;
  handwrittenConfidence?: number;
  gemmaSummary?: string; // legacy field for local GLM-generated verification and document summary
  structuredData: {
    medications?: Array<{ name: string; dosage: string; frequency: string; duration: string }>;
    metrics?: Array<{ name: string; value: string; range: string; status: 'normal' | 'high' | 'low' }>;
    diagnosis?: string;
    doctorName?: string;
    clinicName?: string;
    admitDate?: string;
    dischargeDate?: string;
    keyFindings?: string[];
  };
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  type: DocumentType | 'consultation';
  sourceId: string;
}

export interface PatientRecord {
  id: string;
  name: string;
  age: number;
  gender: string;
  abhaId: string;
  abhaLinked: boolean;
  chiefComplaint: string;
  hpi: string;
  redFlags: string[];
  triageLevel: TriagePriority;
  scannedDocs: ScannedDoc[];
  historyTimeline: TimelineEvent[];
  routedStatus: 'DRAFT' | 'ROUTED' | 'PUSHED_TO_HIS';
  routedAt?: string;
  summaryText?: string;
}
