import React, { useState } from 'react';
import { Upload, FileText, Calendar, ChevronRight, Check, AlertCircle, Eye } from 'lucide-react';
import { ScannedDoc, TimelineEvent } from '../types/medical';

interface ScanSectionProps {
  onScanComplete: (scannedDocs: ScannedDoc[], timeline: TimelineEvent[]) => void;
  existingDocs: ScannedDoc[];
  existingTimeline: TimelineEvent[];
}

// Preset documents to simulate high-fidelity OCR scanning
const PRESET_DOCUMENTS = {
  prescription: {
    name: "Prescription_Dr_Verma_May2026.jpg",
    type: "prescription" as const,
    rawText: `Dr. A. K. Verma, MD (Medicine)
Reg No: 54321 - Metro Health Clinic
Date: 12-May-2026

Rx:
1. Tab. Metformin 500mg ---- OD (Once Daily) after dinner --- 3 months (Diabetes)
2. Tab. Atorvastatin 20mg -- HS (At bed time) --- 1 month (Cholesterol)
3. Tab. Telmisartan 40mg -- OD (Morning) --- 6 months (HTN)

Note: Check renal profile and HbA1c in 2 months.
Signature: [Dr. Verma]`,
    structuredData: {
      medications: [
        { name: "Metformin", dosage: "500mg", frequency: "Once Daily (After dinner)", duration: "3 months" },
        { name: "Atorvastatin", dosage: "20mg", frequency: "At bed time", duration: "1 month" },
        { name: "Telmisartan", dosage: "40mg", frequency: "Once Daily (Morning)", duration: "6 months" }
      ],
      doctorName: "Dr. A. K. Verma",
      clinicName: "Metro Health Clinic"
    },
    date: "2026-05-12"
  },
  lab_report: {
    name: "LabReport_Thyrocare_July2026.pdf",
    type: "lab_report" as const,
    rawText: `THYROCARE DIAGNOSTICS
PATIENT ID: P-887413 | DATE: 15-July-2026
TEST: RENAL FUNCTION & LIPID PANEL

TEST NAME             VALUE         UNIT       REFERENCE RANGE
Serum Creatinine      1.80          mg/dL      0.60 - 1.20   [HIGH]
Blood Urea Nitrogen   28            mg/dL      7 - 20        [HIGH]
Total Cholesterol     245           mg/dL      125 - 200     [HIGH]
Triglycerides         185           mg/dL      < 150         [HIGH]
eGFR                  52            ml/min     > 90          [LOW]

Report Status: Final Authorized Signatory`,
    structuredData: {
      metrics: [
        { name: "Serum Creatinine", value: "1.80 mg/dL", range: "0.60 - 1.20 mg/dL", status: "high" as const },
        { name: "Blood Urea Nitrogen (BUN)", value: "28 mg/dL", range: "7 - 20 mg/dL", status: "high" as const },
        { name: "Total Cholesterol", value: "245 mg/dL", range: "125 - 200 mg/dL", status: "high" as const },
        { name: "eGFR", value: "52 ml/min", range: "> 90 ml/min", status: "low" as const }
      ],
      clinicName: "Thyrocare Diagnostics"
    },
    date: "2026-07-15"
  },
  discharge: {
    name: "DischargeSummary_MaxHospital_Jan2026.pdf",
    type: "discharge_summary" as const,
    rawText: `MAX SUPERSPECIALITY CLINIC
DISCHARGE SUMMARY
Patient Name: Patient Demo | Age: 45 yrs
Date of Admission: 10-Jan-2026 | Date of Discharge: 12-Jan-2026

DIAGNOSIS: Acute Gastroenteritis with severe dehydration

CLINICAL COURSE: Patient presented with vomiting and watery stools. Dehydration treated with IV fluids (NS 1.5L). Stabilized over 48 hours. Vitals at discharge: BP 120/80, Pulse 76/min, afebrile.

DISCHARGE MEDICATIONS:
- Cap. Ofloxacin 200mg + Ornidazole 500mg --- BD for 5 days.
- ORS sachet as required.

Consultant: Dr. Neha Sen, Gastroenterology`,
    structuredData: {
      diagnosis: "Acute Gastroenteritis with severe dehydration",
      doctorName: "Dr. Neha Sen",
      clinicName: "Max Superspeciality Clinic",
      admitDate: "2026-01-10",
      dischargeDate: "2026-01-12",
      keyFindings: ["Severe dehydration", "Treated with 1.5L IV Normal Saline", "Discharged stable"]
    },
    date: "2026-01-12"
  }
};

export const ScanSection: React.FC<ScanSectionProps> = ({
  onScanComplete,
  existingDocs,
  existingTimeline,
}) => {
  const [docs, setDocs] = useState<ScannedDoc[]>(existingDocs);
  const [timeline, setTimeline] = useState<TimelineEvent[]>(existingTimeline);
  
  // Animation states
  const [isScanning, setIsScanning] = useState(false);
  const [scanningDocName, setScanningDocName] = useState('');
  const [previewDoc, setPreviewDoc] = useState<ScannedDoc | null>(null);

  // Trigger simulated scanning flow
  const handlePresetSelect = (presetKey: keyof typeof PRESET_DOCUMENTS) => {
    const selected = PRESET_DOCUMENTS[presetKey];
    
    // Check if already added to avoid duplicates
    if (docs.some(d => d.name === selected.name)) {
      alert("This document is already uploaded and digitized!");
      return;
    }

    setIsScanning(true);
    setScanningDocName(selected.name);

    setTimeout(() => {
      setIsScanning(false);
      
      const newDocId = `doc-${Date.now()}`;
      const newDoc: ScannedDoc = {
        id: newDocId,
        name: selected.name,
        type: selected.type,
        uploadedAt: new Date().toLocaleDateString(),
        rawText: selected.rawText,
        structuredData: selected.structuredData
      };

      const newTimelineEvent: TimelineEvent = {
        id: `tl-${Date.now()}`,
        date: selected.date,
        title: selected.type === 'prescription' ? "Dr. Verma Prescription"
             : selected.type === 'lab_report' ? "Thyrocare Renal Panel"
             : "Max Hospital Discharge",
        description: selected.type === 'prescription' ? "3 chronic medications extracted."
                   : selected.type === 'lab_report' ? "Creatinine levels high (1.80 mg/dL)"
                   : "Acute Gastroenteritis admission.",
        type: selected.type,
        sourceId: newDocId
      };

      const updatedDocs = [...docs, newDoc];
      
      // Sort timeline chronologically (latest first)
      const updatedTimeline = [...timeline, newTimelineEvent].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setDocs(updatedDocs);
      setTimeline(updatedTimeline);
      setPreviewDoc(newDoc);
    }, 2200); // 2.2 seconds scan animation
  };

  const handleNext = () => {
    onScanComplete(docs, timeline);
  };

  return (
    <div className="neo-card" style={{ border: '3px solid #1E1E1E' }}>
      {/* Banner */}
      <div className="flex-between" style={{ marginBottom: '1rem', borderBottom: '3px solid #1E1E1E', paddingBottom: '0.75rem' }}>
        <div>
          <span className="neo-badge badge-pink" style={{ marginRight: '0.5rem' }}>STEP 3</span>
          <span style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>DIGITIZE & TIMELINE RECORDS</span>
        </div>
      </div>

      <div style={scannerMainGrid}>
        {/* Left Side: Upload zone and presets */}
        <div>
          <h3 style={{ marginBottom: '0.75rem' }}>Upload History Records</h3>
          
          {/* Uploader Box */}
          <div style={uploaderBoxStyle}>
            <Upload size={32} style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontWeight: '700' }}>Drag & Drop Prior Records</div>
            <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.2rem' }}>Prescriptions, Lab PDFs, or Discharge papers</div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: '800', backgroundColor: '#EEE', padding: '0.2rem 0.5rem', border: '1px solid #1E1E1E' }}>
              OR SELECT DEMO TEMPLATES BELOW
            </div>
          </div>

          {/* Quick Demo Templates */}
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button 
              onClick={() => handlePresetSelect('prescription')} 
              className="neo-btn btn-white" 
              style={presetBtnStyle}
              disabled={isScanning}
            >
              <FileText size={18} /> Load Dr. Verma Prescription (Handwritten) <ChevronRight size={16} />
            </button>
            <button 
              onClick={() => handlePresetSelect('lab_report')} 
              className="neo-btn btn-white" 
              style={presetBtnStyle}
              disabled={isScanning}
            >
              <FileText size={18} /> Load Thyrocare Renal Lab Report <ChevronRight size={16} />
            </button>
            <button 
              onClick={() => handlePresetSelect('discharge')} 
              className="neo-btn btn-white" 
              style={presetBtnStyle}
              disabled={isScanning}
            >
              <FileText size={18} /> Load Max Hospital Discharge Summary <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Right Side: Scan Status / Real-time Digitizer */}
        <div className="neo-card" style={{ backgroundColor: '#F9FAFB', border: '2px solid #1E1E1E', padding: '1rem', boxShadow: 'none', minHeight: '350px' }}>
          
          {/* Active scanning state animation */}
          {isScanning && (
            <div style={scannerLoadingContainer}>
              <div style={scanningLaserBeam} />
              <FileText size={48} className="animate-pulse-slow" style={{ color: '#C084FC', marginBottom: '1rem' }} />
              <h4 style={{ fontFamily: 'var(--font-display)' }}>OCR DIGITIZING HANDWRITING...</h4>
              <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>Running segmenter and table parser on {scanningDocName}</p>
            </div>
          )}

          {/* Previewing structured output */}
          {!isScanning && previewDoc && (
            <div>
              <div className="flex-between" style={{ borderBottom: '2px solid #1E1E1E', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                <span className="neo-badge badge-green" style={{ fontSize: '0.65rem' }}>OCR SUCCESSFUL</span>
                <span style={{ fontWeight: '700', fontSize: '0.85rem', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{previewDoc.name}</span>
              </div>
              
              {/* Prescriptions View */}
              {previewDoc.type === 'prescription' && previewDoc.structuredData.medications && (
                <div>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Parsed Chronics:</h4>
                  <table style={parsedTableStyle}>
                    <thead>
                      <tr style={{ backgroundColor: '#FFE800' }}>
                        <th style={thStyle}>Medication</th>
                        <th style={thStyle}>Dosage</th>
                        <th style={thStyle}>Frequency</th>
                        <th style={thStyle}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDoc.structuredData.medications.map((m, idx) => (
                        <tr key={idx}>
                          <td style={tdStyle}><strong>{m.name}</strong></td>
                          <td style={tdStyle}>{m.dosage}</td>
                          <td style={tdStyle}>{m.frequency}</td>
                          <td style={tdStyle}>{m.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={ocrHighlightFooter}>
                    <strong>Clinic:</strong> {previewDoc.structuredData.clinicName} | <strong>Doctor:</strong> {previewDoc.structuredData.doctorName}
                  </div>
                </div>
              )}

              {/* Lab Report View */}
              {previewDoc.type === 'lab_report' && previewDoc.structuredData.metrics && (
                <div>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Extracted Lab Biomarkers:</h4>
                  <table style={parsedTableStyle}>
                    <thead>
                      <tr style={{ backgroundColor: '#FFE800' }}>
                        <th style={thStyle}>Biomarker</th>
                        <th style={thStyle}>Value</th>
                        <th style={thStyle}>Ref Range</th>
                        <th style={thStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDoc.structuredData.metrics.map((m, idx) => (
                        <tr key={idx} style={{ backgroundColor: m.status === 'high' ? '#FEE2E2' : 'transparent' }}>
                          <td style={tdStyle}>{m.name}</td>
                          <td style={tdStyle}><strong>{m.value}</strong></td>
                          <td style={tdStyle}>{m.range}</td>
                          <td style={tdStyle}>
                            <span className={`neo-badge ${m.status === 'high' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.55rem', padding: '0.1rem 0.25rem' }}>
                              {m.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={ocrHighlightFooter}>
                    ⚠️ Renal Clearance (eGFR) flagged as low. Creatinine level indicates moderate kidney strain.
                  </div>
                </div>
              )}

              {/* Discharge Summary View */}
              {previewDoc.type === 'discharge_summary' && (
                <div>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>Discharge Highlights:</h4>
                  <div style={dischargeBoxStyle}>
                    <p><strong>Primary Diagnosis:</strong> {previewDoc.structuredData.diagnosis}</p>
                    <p style={{ marginTop: '0.25rem' }}><strong>Hospital Course:</strong></p>
                    <ul style={{ paddingLeft: '1.25rem', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                      {previewDoc.structuredData.keyFindings?.map((kf, i) => (
                        <li key={i}>{kf}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={ocrHighlightFooter}>
                    <strong>Consultant:</strong> {previewDoc.structuredData.doctorName} ({previewDoc.structuredData.clinicName})
                  </div>
                </div>
              )}

              {/* Toggle to see Raw Plain Text OCR Output */}
              <details style={{ marginTop: '0.75rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase' }}>
                  <Eye size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> View Raw OCR Stream
                </summary>
                <pre style={rawTextContainer}>{previewDoc.rawText}</pre>
              </details>
            </div>
          )}

          {!isScanning && !previewDoc && (
            <div style={emptyScanContainer}>
              <AlertCircle size={28} style={{ color: 'var(--color-gray)', marginBottom: '0.5rem' }} />
              <h4>Pending Digitization</h4>
              <p style={{ fontSize: '0.75rem', color: '#666', textAlign: 'center', maxWidth: '80%', marginTop: '0.2rem' }}>
                Select a document preset on the left to start real-time digital OCR text extraction.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Visual Health History Timeline Section */}
      {timeline.length > 0 && (
        <div style={{ marginTop: '1.5rem', borderTop: '3px solid #1E1E1E', paddingTop: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Calendar size={22} /> DIGITAL PATIENT HEALTH TIMELINE
          </h3>

          <div style={timelineContainer}>
            {timeline.map((event) => (
              <div 
                key={event.id} 
                style={timelineItemStyle} 
                onClick={() => {
                  const matchingDoc = docs.find(d => d.id === event.sourceId);
                  if (matchingDoc) setPreviewDoc(matchingDoc);
                }}
              >
                {/* Timeline connector circle */}
                <div style={timelineBulletStyle}>
                  <Check size={12} style={{ color: '#FFF' }} />
                </div>
                
                {/* Timeline content block (Neobrutalist card tiny) */}
                <div 
                  className="neo-card hoverable" 
                  style={{ 
                    margin: 0, 
                    padding: '0.5rem 0.75rem', 
                    boxShadow: '2px 2px 0px #1E1E1E',
                    cursor: 'pointer',
                    backgroundColor: event.type === 'prescription' ? '#A3E635' : event.type === 'lab_report' ? '#FFE800' : '#FF8E9E'
                  }}
                >
                  <div style={{ fontSize: '0.65rem', fontWeight: '800' }}>{event.date}</div>
                  <div style={{ fontWeight: '800', fontSize: '0.8rem' }}>{event.title}</div>
                  <div style={{ fontSize: '0.7rem', marginTop: '0.1rem', opacity: 0.9 }}>{event.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '3px solid #1E1E1E', paddingTop: '1rem' }}>
        <button 
          onClick={handleNext} 
          className="neo-btn btn-yellow"
          disabled={docs.length === 0}
          style={{ padding: '0.85rem 2rem' }}
        >
          {docs.length === 0 ? 'Upload/Scan at least 1 document' : 'Generate Summary & Route (Step 4)'} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

// Styles
const scannerMainGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '1.5rem',
};

const uploaderBoxStyle: React.CSSProperties = {
  border: '3px dashed #1E1E1E',
  borderRadius: '8px',
  padding: '2.5rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#FFF',
  cursor: 'pointer',
};

const presetBtnStyle: React.CSSProperties = {
  width: '100%',
  justifyContent: 'space-between',
  fontSize: '0.85rem',
  padding: '0.6rem 1rem',
  textAlign: 'left',
  boxShadow: '3px 3px 0px #1E1E1E',
};

const scannerLoadingContainer: React.CSSProperties = {
  position: 'relative',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

const scanningLaserBeam: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '4px',
  backgroundColor: '#4ADE80',
  boxShadow: '0 0 10px #4ADE80, 0 0 20px #4ADE80',
  animation: 'scanLine 2s linear infinite',
};

const emptyScanContainer: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
};

const parsedTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.75rem',
  border: '2px solid #1E1E1E',
};

const thStyle: React.CSSProperties = {
  border: '1px solid #1E1E1E',
  padding: '0.4rem',
  textAlign: 'left',
  fontWeight: '800',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #1E1E1E',
  padding: '0.35rem',
};

const ocrHighlightFooter: React.CSSProperties = {
  marginTop: '0.75rem',
  backgroundColor: '#FFFBEB',
  border: '1.5px solid #FEF3C7',
  padding: '0.5rem',
  fontSize: '0.7rem',
  borderRadius: '4px',
};

const dischargeBoxStyle: React.CSSProperties = {
  border: '1.5px solid #1E1E1E',
  padding: '0.5rem',
  fontSize: '0.75rem',
  backgroundColor: '#FFF',
  lineHeight: '1.4',
};

const rawTextContainer: React.CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.5rem',
  backgroundColor: '#1E1E1E',
  color: '#4ADE80',
  borderRadius: '4px',
  fontSize: '0.65rem',
  overflowX: 'auto',
  maxHeight: '120px',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
};

const timelineContainer: React.CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  overflowX: 'auto',
  padding: '0.5rem 0.5rem 1rem 0.5rem',
  alignItems: 'flex-start',
  borderLeft: '3px solid #1E1E1E',
};

const timelineItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  position: 'relative',
  minWidth: '200px',
};

const timelineBulletStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  backgroundColor: '#1E1E1E',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '0.2rem',
  marginLeft: '-11px',
};

// Add scanner animation styles in component head or inject via css
if (typeof document !== 'undefined') {
  const styleTag = document.createElement('style');
  styleTag.innerHTML = `
    @keyframes scanLine {
      0% { top: 0%; }
      50% { top: 95%; }
      100% { top: 0%; }
    }
  `;
  document.head.appendChild(styleTag);
}
