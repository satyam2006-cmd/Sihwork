export type TriagePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SpeechTurn {
  id: string;
  sender: 'ai' | 'patient';
  text: string;
  timestamp: string;
}

export type DocumentType = 'prescription' | 'lab_report' | 'discharge_summary';

export interface ScannedDoc {
  id: string;
  name: string;
  type: DocumentType;
  uploadedAt: string;
  rawText: string;
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
