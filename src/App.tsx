import React, { useState } from 'react';
import { Settings, User, Activity } from 'lucide-react';
import { PatientRecord, ScannedDoc, TimelineEvent, TriagePriority } from './types/medical';
import { ConverseSection } from './components/ConverseSection';
import { ScanSection } from './components/ScanSection';
import { SummarizeRouteSection } from './components/SummarizeRouteSection';
import { DoctorDashboard } from './components/DoctorDashboard';
import { SettingsModal } from './components/SettingsModal';

// Pre-seeded patients for high-fidelity doctor dashboard demo
const PRESEED_PATIENTS: PatientRecord[] = [
  {
    id: "pat-pre-1",
    name: "Ramesh Patel",
    age: 62,
    gender: "Male",
    abhaId: "91-8843-1250-9982",
    abhaLinked: true,
    chiefComplaint: "Severe breathing distress for 2 hours",
    hpi: "Patient reports sudden onset of shortness of breath which worsened while walking. Feels tight in chest. No chest pain reported, but sweating profusely.",
    redFlags: ["Shortness of Breath / Respiratory Distress"],
    triageLevel: "HIGH",
    scannedDocs: [
      {
        id: "doc-pre-1",
        name: "Discharge_MaxHospital_Jan2026.pdf",
        type: "discharge_summary",
        uploadedAt: "2026-08-27",
        rawText: "Admitted for Asthma flare. Discharged stable on Seroflo inhaler.",
        structuredData: {
          diagnosis: "Asthma Exacerbation",
          clinicName: "Max Hospital"
        }
      }
    ],
    historyTimeline: [
      {
        id: "tl-pre-1",
        date: "2026-01-12",
        title: "Max Hospital Discharge",
        description: "Asthma Exacerbation stabilization",
        type: "discharge_summary",
        sourceId: "doc-pre-1"
      }
    ],
    routedStatus: "PUSHED_TO_HIS",
    routedAt: "22:01:05",
    summaryText: `# CLINICAL ENCOUNTER SUMMARY

## 1. CHIEF COMPLAINT
Severe shortness of breath for 2 hours.

## 2. HISTORY OF PRESENT ILLNESS (HPI)
Patient Ramesh Patel, a 62-year-old male, reports sudden onset of shortness of breath, aggravated by light physical exertion. Reports chest tightness. Denies radiation of pain.

## 3. TRIAGE CLASSIFICATION
- **Priority**: HIGH
- **Red Flags**: ⚠️ Shortness of Breath / Respiratory Distress

## 4. DIGITIZED DOCUMENT HIGHLIGHTS
- Prior Discharge Summary (Max Hospital) notes history of severe asthma.

## 5. RECOMMENDED NEXT STEPS
- Administer nebulization instantly.
- Monitor oxygen saturation (SpO2).
- Keep physician alerted for potential acute asthma/cardiac overlap.`
  },
  {
    id: "pat-pre-2",
    name: "Amit Sharma",
    age: 38,
    gender: "Male",
    abhaId: "44-9982-1102-4413",
    abhaLinked: true,
    chiefComplaint: "Routine Diabetes Checkup & Medication Refill",
    hpi: "Patient reports checking routine fasting sugars at home. Ranging 130-145 mg/dL. Complains of mild fatigue in evening. Seeking Metformin renewal.",
    redFlags: [],
    triageLevel: "MEDIUM",
    scannedDocs: [],
    historyTimeline: [],
    routedStatus: "PUSHED_TO_HIS",
    routedAt: "22:10:44",
    summaryText: `# CLINICAL ENCOUNTER SUMMARY

## 1. CHIEF COMPLAINT
Routine diabetes checkup & refill.

## 2. HISTORY OF PRESENT ILLNESS (HPI)
Patient Amit Sharma, a 38-year-old male, presents for follow-up on Type-2 Diabetes Mellitus. Reporting morning fasting blood sugar of ~138 mg/dL. Reports mild evening fatigue.

## 3. TRIAGE CLASSIFICATION
- **Priority**: MEDIUM
- **Red Flags**: None

## 4. DIGITIZED DOCUMENT HIGHLIGHTS
- Prior Metformin therapy active.

## 5. RECOMMENDED NEXT STEPS
- Order routine HbA1c panel.
- Refill Metformin as requested.`
  }
];

export const App: React.FC = () => {
  // Navigation & Modal toggles
  const [activeTab, setActiveTab] = useState<'patient' | 'doctor'>('patient');
  const [activeStep, setActiveStep] = useState<2 | 3 | 4>(2);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings & Patient configs (saved in localStorage)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('sih_gemini_api_key') || '');
  const [interviewMode, setInterviewMode] = useState<'simulated' | 'gemini' | 'browser'>(() => {
    const val = localStorage.getItem('sih_interview_mode');
    if (val === 'gemini' || val === 'browser' || val === 'simulated') return val;
    return 'simulated';
  });
  const [patientName, setPatientName] = useState(() => localStorage.getItem('sih_patient_name') || 'Satya Narayana');
  const [patientAge, setPatientAge] = useState(() => Number(localStorage.getItem('sih_patient_age')) || 45);
  const [patientGender, setPatientGender] = useState(() => localStorage.getItem('sih_patient_gender') || 'Male');

  // Patients database state (pre-loaded with mock entries)
  const [patients, setPatients] = useState<PatientRecord[]>(PRESEED_PATIENTS);

  // Current Patient check-in flow states
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [hpi, setHpi] = useState('');
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [triageLevel, setTriageLevel] = useState<TriagePriority>('LOW');
  const [scannedDocs, setScannedDocs] = useState<ScannedDoc[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  // Step 2 Completed callback
  const handleInterviewComplete = (data: {
    chiefComplaint: string;
    hpi: string;
    redFlags: string[];
    triageLevel: TriagePriority;
    turns: any[];
  }) => {
    setChiefComplaint(data.chiefComplaint);
    setHpi(data.hpi);
    setRedFlags(data.redFlags);
    setTriageLevel(data.triageLevel);
    setActiveStep(3);
  };

  // Step 3 Completed callback
  const handleScanComplete = (docs: ScannedDoc[], tl: TimelineEvent[]) => {
    setScannedDocs(docs);
    setTimeline(tl);
    setActiveStep(4);
  };

  // Step 4 Pushed to HIS final callback
  const handleRouteComplete = (newPatient: PatientRecord) => {
    setPatients(prev => [newPatient, ...prev]);
    // Redirect to doctor dashboard
    setActiveTab('doctor');
    // Reset check-in state for potential next check-in
    resetCheckinState();
  };

  const resetCheckinState = () => {
    setChiefComplaint('');
    setHpi('');
    setRedFlags([]);
    setTriageLevel('LOW');
    setScannedDocs([]);
    setTimeline([]);
    setActiveStep(2);
  };

  return (
    <div>
      {/* Neobrutalist Header Banner */}
      <header className="neo-header" style={{ borderBottom: '4px solid #1E1E1E' }}>
        <div className="container flex-between" style={{ padding: '0.2rem 1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚡ MEDPULSE AI <span className="neo-badge badge-yellow" style={{ fontSize: '0.65rem', verticalAlign: 'middle' }}>HACKATHON DEMO</span>
            </h1>
            <p style={{ fontSize: '0.75rem', fontWeight: '500', color: '#444', marginTop: '0.1rem' }}>
              Adaptive voice triage, OCR digitization, and HIS physician routing system
            </p>
          </div>
          <div className="flex-gap">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="neo-btn btn-pink"
              style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}
            >
              <Settings size={18} /> Settings
            </button>
          </div>
        </div>
      </header>

      {/* Main Tab Controller & Workspace */}
      <main className="container">
        
        {/* Navigation Tabs */}
        <div style={tabContainerStyle}>
          <button
            onClick={() => setActiveTab('patient')}
            className={`neo-btn ${activeTab === 'patient' ? 'btn-yellow' : 'btn-white'}`}
            style={activeTab === 'patient' ? tabActiveStyle : tabInactiveStyle}
          >
            <User size={18} /> PATIENT CHECK-IN FLOW
          </button>
          <button
            onClick={() => setActiveTab('doctor')}
            className={`neo-btn ${activeTab === 'doctor' ? 'btn-purple' : 'btn-white'}`}
            style={activeTab === 'doctor' ? tabActiveStyle : tabInactiveStyle}
          >
            <Activity size={18} /> PHYSICIAN DASHBOARD ({patients.length})
          </button>
        </div>

        {/* Tab workspace Panels */}
        {activeTab === 'patient' ? (
          <div>
            {/* Step Indicators bar */}
            <div style={stepIndicatorsBar}>
              <div style={{ ...stepBadge, backgroundColor: activeStep === 2 ? '#FFE800' : '#FFF' }}>
                <span style={{ fontWeight: '800' }}>STEP 2:</span> CONVERSE (Voice Interview)
              </div>
              <div style={{ ...stepBadge, backgroundColor: activeStep === 3 ? '#FF8E9E' : '#FFF' }}>
                <span style={{ fontWeight: '800' }}>STEP 3:</span> SCAN (OCR Digitizer)
              </div>
              <div style={{ ...stepBadge, backgroundColor: activeStep === 4 ? '#C084FC' : '#FFF' }}>
                <span style={{ fontWeight: '800' }}>STEP 4:</span> SUMMARIZE & ROUTE
              </div>
            </div>

            {/* Rendering active checking step */}
            {activeStep === 2 && (
              <ConverseSection
                apiKey={apiKey}
                interviewMode={interviewMode}
                patientName={patientName}
                patientAge={patientAge}
                patientGender={patientGender}
                onInterviewComplete={handleInterviewComplete}
              />
            )}

            {activeStep === 3 && (
              <ScanSection
                onScanComplete={handleScanComplete}
                existingDocs={scannedDocs}
                existingTimeline={timeline}
              />
            )}

            {activeStep === 4 && (
              <SummarizeRouteSection
                apiKey={apiKey}
                interviewMode={interviewMode}
                patientName={patientName}
                patientAge={patientAge}
                patientGender={patientGender}
                chiefComplaint={chiefComplaint}
                hpi={hpi}
                redFlags={redFlags}
                triageLevel={triageLevel}
                scannedDocs={scannedDocs}
                timeline={timeline}
                onRouteComplete={handleRouteComplete}
              />
            )}
          </div>
        ) : (
          <DoctorDashboard
            patients={patients}
            onConsultPatient={(id) => {
              setPatients(prev => prev.filter(p => p.id !== id));
            }}
          />
        )}

      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        interviewMode={interviewMode}
        setInterviewMode={setInterviewMode}
        patientName={patientName}
        setPatientName={setPatientName}
        patientAge={patientAge}
        setPatientAge={setPatientAge}
        patientGender={patientGender}
        setPatientGender={setPatientGender}
      />
    </div>
  );
};

// Styles
const tabContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  marginBottom: '2rem',
};

const tabActiveStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.85rem',
  boxShadow: '2px 2px 0px #1E1E1E',
  transform: 'translate(2px, 2px)',
};

const tabInactiveStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.85rem',
  boxShadow: '5px 5px 0px #1E1E1E',
};

const stepIndicatorsBar: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '1.5rem',
};

const stepBadge: React.CSSProperties = {
  flex: 1,
  minWidth: '220px',
  padding: '0.6rem',
  border: '3px solid #1E1E1E',
  boxShadow: '3px 3px 0px #1E1E1E',
  borderRadius: '4px',
  fontSize: '0.8rem',
  textAlign: 'center',
};
