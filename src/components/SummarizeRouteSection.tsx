import React, { useState, useEffect } from 'react';
import { ShieldCheck, Heart, Database, Share2, ArrowRight, CheckCircle, RefreshCw } from 'lucide-react';
import { AppLanguageCode, PatientRecord, ScannedDoc, TimelineEvent, TriagePriority } from '../types/medical';
import { generateClinicalSummaryLocalMedGemma } from '../utils/ai';

interface SummarizeRouteSectionProps {
  apiKey: string;
  interviewMode: 'simulated' | 'browser';
  patientName: string;
  patientAge: number;
  patientGender: string;
  languageCode: AppLanguageCode;
  otherLanguageName: string;
  chiefComplaint: string;
  hpi: string;
  redFlags: string[];
  triageLevel: TriagePriority;
  scannedDocs: ScannedDoc[];
  timeline: TimelineEvent[];
  onRouteComplete: (patientRecord: PatientRecord) => void;
}

export const SummarizeRouteSection: React.FC<SummarizeRouteSectionProps> = ({
  patientName,
  patientAge,
  patientGender,
  languageCode,
  otherLanguageName,
  chiefComplaint,
  hpi,
  redFlags,
  triageLevel,
  scannedDocs,
  timeline,
  onRouteComplete,
}) => {
  const [summary, setSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // ABHA states
  const [abhaId, setAbhaId] = useState('12-3456-7890-1234');
  const [isAbhaLinked, setIsAbhaLinked] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  // HIS Integration simulation states
  const [isPushingToHis, setIsPushingToHis] = useState(false);
  const [hisLogs, setHisLogs] = useState<string[]>([]);
  const [isPushed, setIsPushed] = useState(false);

  useEffect(() => {
    generateSummaryContent();
  }, []);

  const generateSummaryContent = async () => {
    setIsGenerating(true);
    try {
      const generated = await generateClinicalSummaryLocalMedGemma({
        name: patientName,
        age: patientAge,
        gender: patientGender,
        languageCode,
        otherLanguageName,
        chiefComplaint,
        hpi,
        redFlags,
        triageLevel,
        scannedDocs
      });
      setSummary(generated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLinkAbha = () => {
    if (!abhaId.trim()) return;
    setIsLinking(true);
    setTimeout(() => {
      setIsLinking(false);
      setIsAbhaLinked(true);
    }, 1200);
  };

  const handlePushToHis = () => {
    setIsPushingToHis(true);
    setHisLogs([]);

    const logLine = (msg: string) => {
      setHisLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    setTimeout(() => {
      logLine("POST /api/v1/patients/checkin HTTP/1.1");
      logLine("Headers: Authorization: Bearer HIS_TOKEN_X992");
    }, 300);

    setTimeout(() => {
      logLine(`Payload: { name: "${patientName}", age: ${patientAge}, triage: "${triageLevel}" }`);
      logLine(`Pushing ABHA link status: ${isAbhaLinked ? abhaId : 'UNLINKED'}`);
      logLine(`Syncing ${scannedDocs.length} OCR parsed medical records...`);
    }, 800);

    setTimeout(() => {
      logLine("Uploading structured HPI summary into doctor clinical inbox...");
      logLine("Routing priority queue assignment: PRIORITY_" + triageLevel);
    }, 1500);

    setTimeout(() => {
      logLine("RESPONSE: 201 Created");
      logLine("Body: { code: 'SUCCESS', record_id: 'REC-90812', triage_queue_no: 'T-" + (triageLevel === 'URGENT' ? '01' : '15') + "' }");
      setIsPushingToHis(false);
      setIsPushed(true);
    }, 2200);
  };

  const handleFinalize = () => {
    const finalRecord: PatientRecord = {
      id: `pat-${Date.now()}`,
      name: patientName,
      age: patientAge,
      gender: patientGender,
      abhaId: isAbhaLinked ? abhaId : '',
      abhaLinked: isAbhaLinked,
      chiefComplaint,
      hpi,
      redFlags,
      triageLevel,
      scannedDocs,
      historyTimeline: timeline,
      routedStatus: 'PUSHED_TO_HIS',
      routedAt: new Date().toLocaleTimeString(),
      summaryText: summary
    };
    onRouteComplete(finalRecord);
  };

  return (
    <div className="neo-card" style={{ border: '3px solid #1E1E1E' }}>
      {/* Banner */}
      <div className="flex-between" style={{ marginBottom: '1rem', borderBottom: '3px solid #1E1E1E', paddingBottom: '0.75rem' }}>
        <div>
          <span className="neo-badge badge-purple" style={{ marginRight: '0.5rem' }}>STEP 4</span>
          <span style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>SUMMARIZE & ROUTE DATA</span>
        </div>
      </div>

      <div style={gridSplit}>
        {/* Left Side: Summary transcription */}
        <div style={{ flex: 1.3 }}>
          <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.1rem' }}>MedGemma Doctor One-Shot Summary</h3>
            <button 
              onClick={generateSummaryContent} 
              className="neo-btn btn-white" 
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', boxShadow: '2px 2px 0px #1E1E1E' }}
              disabled={isGenerating}
            >
              <RefreshCw size={12} className={isGenerating ? 'animate-pulse-slow' : ''} /> Regenerate
            </button>
          </div>

          <div className="neo-card" style={transcriptionPaper}>
            {isGenerating ? (
              <div style={spinnerStyle}>
                <div className="animate-pulse-slow" style={{ fontWeight: '800' }}>MEDGEMMA COMPILING DOCTOR SUMMARY...</div>
              </div>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                {summary}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: ABHA Links & HIS Pushes */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* ABHA Link Card */}
          <div className="neo-card" style={subCardStyle}>
            <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={18} /> ABHA ID Verification
            </h3>
            
            {!isAbhaLinked ? (
              <div>
                <p style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.5rem' }}>
                  Link patients' government health account (ABHA) to sync their digital locker.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="neo-input"
                    value={abhaId}
                    onChange={(e) => setAbhaId(e.target.value)}
                    placeholder="12-3456-7890-1234"
                    style={{ flex: 1, fontSize: '0.85rem', height: '38px', padding: '0.5rem' }}
                  />
                  <button 
                    onClick={handleLinkAbha} 
                    className="neo-btn btn-purple" 
                    style={{ height: '38px', padding: '0 0.75rem', fontSize: '0.8rem', boxShadow: '2px 2px 0px #1E1E1E' }}
                    disabled={isLinking}
                  >
                    {isLinking ? 'Linking...' : 'Verify'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={abhaBadgeCard}>
                <div style={abhaBadgeHeader}>
                  <Heart size={14} fill="#FF8E9E" /> GOVERNMENT OF INDIA HEALTH ID
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>ABHA Name:</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '800' }}>{patientName.toUpperCase()}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '0.25rem' }}>ABHA Number:</div>
                    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: '700' }}>{abhaId}</div>
                  </div>
                  {/* Mock QR Code */}
                  <div style={mockQrCode}>
                    <div style={{ width: '4px', height: '4px', background: '#000', position: 'absolute', top: 2, left: 2 }} />
                    <div style={{ width: '4px', height: '4px', background: '#000', position: 'absolute', top: 2, right: 2 }} />
                    <div style={{ width: '4px', height: '4px', background: '#000', position: 'absolute', bottom: 2, left: 2 }} />
                    <div style={{ width: '6px', height: '6px', background: '#000', position: 'absolute', bottom: 6, right: 6 }} />
                  </div>
                </div>
                <span className="neo-badge badge-green" style={{ fontSize: '0.55rem', position: 'absolute', right: 8, top: 8, padding: '0.1rem 0.3rem' }}>
                  CONNECTED
                </span>
              </div>
            )}
          </div>

          {/* HIS Router Console Card */}
          <div className="neo-card" style={{ ...subCardStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
              <Database size={18} /> PUSH TO HIS (Hospital System)
            </h3>
            
            {/* Terminal logs */}
            <div style={terminalConsole}>
              {hisLogs.length === 0 ? (
                <div style={{ color: '#888', fontStyle: 'italic' }}>HIS Network channel idle. Click "Sync" below to pipe records.</div>
              ) : (
                hisLogs.map((log, index) => (
                  <div key={index} style={{ marginBottom: '0.2rem' }}>{log}</div>
                ))
              )}
            </div>

            {isPushingToHis ? (
              <button className="neo-btn btn-white" style={{ marginTop: '0.75rem', width: '100%' }} disabled>
                Connecting with Clinic Database...
              </button>
            ) : isPushed ? (
              <div className="neo-alert alert-success" style={{ padding: '0.5rem', marginTop: '0.5rem', marginBottom: 0, fontSize: '0.75rem', gap: '0.25rem' }}>
                <CheckCircle size={16} /> Structured record queued in physician consultation portal successfully.
              </div>
            ) : (
              <button 
                onClick={handlePushToHis} 
                className="neo-btn btn-green" 
                style={{ marginTop: '0.75rem', width: '100%', boxShadow: '3px 3px 0px #1E1E1E' }}
              >
                Pipe Digital Records & Encrypt <Share2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      {isPushed && (
        <div style={{ marginTop: '1.5rem', borderTop: '3px solid #1E1E1E', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleFinalize} className="neo-btn btn-yellow" style={{ padding: '0.85rem 2rem' }}>
            Route Patient to Doctor Dashboard <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

// Styles
const gridSplit: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '1.5rem',
};

const transcriptionPaper: React.CSSProperties = {
  backgroundColor: '#FFFBEB', // soft yellow paper tone
  border: '2px solid #1E1E1E',
  borderRadius: '4px',
  boxShadow: 'none',
  padding: '1.25rem',
  minHeight: '380px',
  maxHeight: '440px',
  overflowY: 'auto',
};

const spinnerStyle: React.CSSProperties = {
  display: 'flex',
  height: '300px',
  alignItems: 'center',
  justifyContent: 'center',
};

const subCardStyle: React.CSSProperties = {
  padding: '1rem',
  border: '2px solid #1E1E1E',
  boxShadow: 'none',
  backgroundColor: '#FFF',
  margin: 0,
  borderRadius: '4px',
};

const abhaBadgeCard: React.CSSProperties = {
  background: 'linear-gradient(135deg, #A1EEBD 0%, #7DD3FC 100%)',
  border: '2px solid #1E1E1E',
  padding: '0.75rem',
  borderRadius: '4px',
  position: 'relative',
  color: '#1E1E1E',
  boxShadow: '3px 3px 0px #1E1E1E',
};

const abhaBadgeHeader: React.CSSProperties = {
  fontSize: '0.6rem',
  fontWeight: '800',
  letterSpacing: '1px',
  display: 'flex',
  alignItems: 'center',
  gap: '0.2rem',
  borderBottom: '1px solid rgba(0,0,0,0.15)',
  paddingBottom: '0.25rem',
};

const mockQrCode: React.CSSProperties = {
  width: '36px',
  height: '36px',
  border: '1.5px solid #000',
  backgroundColor: '#FFF',
  position: 'relative',
  alignSelf: 'flex-end',
};

const terminalConsole: React.CSSProperties = {
  flex: 1,
  backgroundColor: '#1E1E1E',
  color: '#A3E635',
  padding: '0.75rem',
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '0.65rem',
  minHeight: '130px',
  maxHeight: '180px',
  overflowY: 'auto',
};
