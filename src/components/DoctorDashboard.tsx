import React, { useState } from 'react';
import { Activity, ShieldCheck, FileText, Calendar, CheckSquare, Clock, AlertTriangle, Sparkles, Eye, X } from 'lucide-react';
import { PatientRecord, TriagePriority } from '../types/medical';

interface MarkdownRendererProps {
  text: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];
  let listKey = 0;

  const flushList = () => {
    if (currentListItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} style={{ paddingLeft: '1.25rem', margin: '0.4rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {currentListItems}
        </ul>
      );
      currentListItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle empty lines
    if (!trimmed) {
      flushList();
      elements.push(<div key={`space-${i}`} style={{ height: '0.4rem' }} />);
      continue;
    }

    // Headers
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={`h1-${i}`} style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0.6rem 0 0.3rem 0', fontFamily: 'var(--font-display)', borderBottom: '2px solid #1E1E1E', paddingBottom: '0.2rem' }}>
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${i}`} style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0.5rem 0 0.25rem 0', color: '#1E1E1E' }}>
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0.4rem 0 0.2rem 0' }}>
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      continue;
    }

    // List items (starts with - or *)
    const listMatch = line.match(/^(\s*)([-*])\s+(.*)/);
    if (listMatch) {
      const content = listMatch[3];
      currentListItems.push(
        <li key={`li-${i}`} style={{ fontSize: '0.8rem', lineHeight: '1.4', margin: 0 }}>
          {renderInline(content)}
        </li>
      );
      continue;
    }

    // Regular paragraph lines
    flushList();
    elements.push(
      <p key={`p-${i}`} style={{ fontSize: '0.8rem', lineHeight: '1.4', margin: '0.2rem 0' }}>
        {renderInline(line)}
      </p>
    );
  }

  flushList();

  return <div style={{ fontFamily: 'var(--font-body)' }}>{elements}</div>;
};

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

interface DoctorDashboardProps {
  patients: PatientRecord[];
  onConsultPatient: (id: string) => void;
}

export const DoctorDashboard: React.FC<DoctorDashboardProps> = ({
  patients,
  onConsultPatient,
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    patients[0]?.id || null
  );
  const [dashboardPreviewImg, setDashboardPreviewImg] = useState<string | null>(null);

  // If no selected patient but patients exist, auto-select the first one
  const activePatient = patients.find(p => p.id === selectedPatientId) || patients[0];

  // Sorting: URGENT -> HIGH -> MEDIUM -> LOW
  const getPriorityWeight = (prio: TriagePriority): number => {
    switch (prio) {
      case 'URGENT': return 4;
      case 'HIGH': return 3;
      case 'MEDIUM': return 2;
      case 'LOW': return 1;
    }
  };

  const sortedPatients = [...patients].sort((a, b) => {
    // Sort by priority weight descending
    const weightDiff = getPriorityWeight(b.triageLevel) - getPriorityWeight(a.triageLevel);
    if (weightDiff !== 0) return weightDiff;
    // If same priority, sort by time (latest first)
    return b.id.localeCompare(a.id);
  });

  const getTriageBadge = (prio: TriagePriority) => {
    switch (prio) {
      case 'URGENT': return <span className="neo-badge badge-red animate-pulse-slow">🚨 URGENT</span>;
      case 'HIGH': return <span className="neo-badge badge-pink">⚠️ HIGH</span>;
      case 'MEDIUM': return <span className="neo-badge badge-yellow">MEDIUM</span>;
      case 'LOW': return <span className="neo-badge badge-green">LOW</span>;
    }
  };

  const getTriageCardStyle = (prio: TriagePriority, isSelected: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      padding: '0.75rem',
      cursor: 'pointer',
      marginBottom: '0.75rem',
      border: '3px solid #1E1E1E',
      transition: 'all 0.1s ease',
      backgroundColor: '#FFF',
      boxShadow: isSelected ? '1px 1px 0px #1E1E1E' : '4px 4px 0px #1E1E1E',
      transform: isSelected ? 'translate(3px, 3px)' : 'none',
    };

    if (prio === 'URGENT') {
      base.borderColor = '#E11D48'; // Red border
      if (!isSelected) {
        base.backgroundColor = '#FFF1F2'; // Soft reddish bg
      }
    }

    return base;
  };

  return (
    <div className="neo-card" style={{ border: '3px solid #1E1E1E', backgroundColor: '#F9FAFB' }}>
      {/* Banner */}
      <div className="flex-between" style={{ marginBottom: '1.5rem', borderBottom: '3px solid #1E1E1E', paddingBottom: '0.75rem', backgroundColor: 'var(--color-yellow)', margin: '-1.5rem -1.5rem 1.5rem -1.5rem', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={24} style={{ color: '#000' }} />
          <span style={{ fontSize: '1.4rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>PHYSICIAN CONSULTATION DESK</span>
        </div>
        <span className="neo-badge badge-white">Live Patient Routing Queue ({patients.length})</span>
      </div>

      {patients.length === 0 ? (
        <div style={emptyQueueContainer}>
          <Clock size={48} style={{ color: '#888', marginBottom: '1rem' }} />
          <h2>Waiting for Check-in Stream</h2>
          <p style={{ color: '#555', marginTop: '0.25rem' }}>
            Check in a patient on the "Patient Interface" tab first. Once pushed to HIS, they appear here.
          </p>
        </div>
      ) : (
        <div style={dashboardGrid}>
          
          {/* Left Side: Priority Queue List */}
          <div style={{ flex: 1, maxHeight: '650px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '2px solid #1E1E1E', paddingBottom: '0.25rem' }}>
              TRIAGE INBOX (Red-Flag Priority)
            </h3>
            
            {sortedPatients.map((p) => {
              const isSelected = p.id === activePatient?.id;
              return (
                <div
                  key={p.id}
                  style={getTriageCardStyle(p.triageLevel, isSelected)}
                  onClick={() => setSelectedPatientId(p.id)}
                >
                  <div className="flex-between" style={{ marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: '800', fontSize: '0.95rem' }}>{p.name}</span>
                    {getTriageBadge(p.triageLevel)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#555' }}>
                    {p.gender}, {p.age} yrs | Check-in: {p.routedAt || 'Just now'}
                  </div>
                  {p.redFlags.length > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#E11D48', fontWeight: '700', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <AlertTriangle size={12} /> Red Flag: {p.redFlags[0]}
                    </div>
                  )}
                  {p.abhaLinked && (
                    <div style={{ fontSize: '0.65rem', color: '#10B981', fontWeight: '800', marginTop: '0.15rem' }}>
                      ✓ ABHA PROFILE ATTACHED
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Side: Active Patient File View */}
          <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activePatient && (
              <div className="neo-card" style={{ border: '3px solid #1E1E1E', margin: 0, padding: '1.25rem', backgroundColor: '#FFF' }}>
                
                {/* Header detail */}
                <div className="flex-between" style={{ borderBottom: '3px solid #1E1E1E', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>{activePatient.name}</h2>
                    <span style={{ fontSize: '0.85rem', color: '#555' }}>
                      <strong>Age:</strong> {activePatient.age} | <strong>Gender:</strong> {activePatient.gender} | <strong>Check-in Time:</strong> {activePatient.routedAt}
                    </span>
                  </div>
                  <div className="flex-gap">
                    <button 
                      onClick={() => onConsultPatient(activePatient.id)} 
                      className="neo-btn btn-green"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', boxShadow: '2px 2px 0px #1E1E1E' }}
                    >
                      <CheckSquare size={16} /> Complete Consultation
                    </button>
                  </div>
                </div>

                {/* ABHA Badge in Detail view */}
                {activePatient.abhaLinked && (
                  <div style={abhaLinkedAlert}>
                    <ShieldCheck size={18} style={{ color: '#059669' }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: '800' }}>
                      Linked Government Health Record (ABHA: {activePatient.abhaId}). Clinical summary synced to Indian Digital Health Grid.
                    </span>
                  </div>
                )}

                {/* Main Split: Clinical summary vs Scanned Docs Timeline */}
                <div style={detailGrid}>
                  
                  {/* Encounter Summary */}
                  <div style={{ flex: 1.3 }}>
                    <h3 style={sectionHeadingStyle}>
                      <FileText size={16} /> Digitized Clinical Summary
                    </h3>
                    <div style={summaryScrollBox}>
                      {activePatient.summaryText ? (
                        <MarkdownRenderer text={activePatient.summaryText} />
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: '1.4' }}>
                          Generating summary...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Scanned Prior Docs & Timeline */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h3 style={sectionHeadingStyle}>
                      <Calendar size={16} /> Digitized Timeline & Files
                    </h3>
                    
                    {/* Tiny Timeline Preview */}
                    <div style={timelineBoxMini}>
                      {activePatient.historyTimeline.length === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: '#888', fontStyle: 'italic' }}>No timeline logs.</p>
                      ) : (
                        activePatient.historyTimeline.map((ev) => (
                          <div key={ev.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', borderLeft: '2px solid #1E1E1E', paddingLeft: '0.5rem', position: 'relative' }}>
                            <div style={dotStyle} />
                            <div>
                              <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#555' }}>{ev.date}</div>
                              <div style={{ fontSize: '0.75rem', fontWeight: '800' }}>{ev.title}</div>
                              <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>{ev.description}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Parsed Scanned Documents Preview */}
                    <h4 style={{ fontSize: '0.8rem', fontWeight: '800', marginTop: '0.25rem' }}>Scanned Documents Extracted:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '350px', overflowY: 'auto' }}>
                      {activePatient.scannedDocs.map((doc) => (
                        <div key={doc.id} className="neo-card" style={{ padding: '0.6rem', margin: 0, boxShadow: '2px 2px 0px #1E1E1E' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {doc.name}</span>
                            <span className="neo-badge badge-yellow" style={{ fontSize: '0.5rem', padding: '0.05rem 0.25rem' }}>
                              {doc.type.toUpperCase()}
                            </span>
                          </div>

                          {doc.imagePreview ? (
                            <div 
                              style={{ border: '2px solid #1E1E1E', borderRadius: '4px', overflow: 'hidden', marginTop: '0.25rem', cursor: 'pointer', position: 'relative' }} 
                              onClick={() => setDashboardPreviewImg(doc.imagePreview || null)}
                              title="Click to double-check original document image"
                            >
                              <img src={doc.imagePreview} alt={doc.name} style={{ width: '100%', maxHeight: '110px', objectFit: 'cover' }} />
                              <div style={{ backgroundColor: '#1E1E1E', color: '#FFF', fontSize: '0.6rem', textAlign: 'center', padding: '0.15rem 0', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                <Eye size={10} /> View Original Document Image
                              </div>
                            </div>
                          ) : doc.filePreview ? (
                            <a
                              href={doc.filePreview}
                              target="_blank"
                              rel="noreferrer"
                              style={attachedFileLinkStyle}
                              title="Open attached PDF/report"
                            >
                              <Eye size={12} /> Open attached file
                            </a>
                          ) : (
                            <div style={{ fontSize: '0.65rem', color: '#777', fontStyle: 'italic', marginTop: '0.25rem', padding: '0.25rem', border: '1.5px dashed #CCC', borderRadius: '4px', textAlign: 'center' }}>
                              No original image attached.
                            </div>
                          )}

                          <div style={confidenceDashStyle}>
                            <div><strong>Source:</strong> {doc.sourceKind || 'uploaded_file'}</div>
                            <div><strong>Printed OCR:</strong> {doc.ocrConfidence ?? 'N/A'}%</div>
                            <div><strong>GLM-OCR:</strong> {doc.handwrittenConfidence ?? 'N/A'}%</div>
                          </div>

                          {doc.gemmaSummary && (
                            <div style={gemmaSummaryDashBox}>
                              <div style={{ fontWeight: '800', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '0.2rem', color: '#B45309' }}>
                                <Sparkles size={11} style={{ color: '#F59E0B' }} /> GLM CLINICAL CHECK
                              </div>
                              <div style={{ fontSize: '0.7rem', whiteSpace: 'pre-wrap', lineHeight: '1.35', color: '#1E1E1E' }}>
                                {doc.gemmaSummary}
                              </div>
                            </div>
                          )}

                          <details style={{ marginTop: '0.35rem' }}>
                            <summary style={{ cursor: 'pointer', fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', color: '#555' }}>
                              View Raw OCR Text
                            </summary>
                            <pre style={{ backgroundColor: '#1E1E1E', color: '#4ADE80', padding: '0.4rem', borderRadius: '4px', fontSize: '0.62rem', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                              {doc.rawText}
                            </pre>
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>

        </div>
      )}

      {/* Full Screen Image Preview Modal */}
      {dashboardPreviewImg && (
        <div style={modalOverlayStyle} onClick={() => setDashboardPreviewImg(null)}>
          <div className="neo-card" style={{ maxWidth: '90%', maxHeight: '90%', backgroundColor: '#FFF', padding: '1rem', boxShadow: '8px 8px 0px #1E1E1E', display: 'flex', flexDirection: 'column', alignItems: 'center', margin: 0 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1E1E1E', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: '800', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Eye size={16} /> ORIGINAL ATTACHED HEALTH RECORD IMAGE
              </span>
              <button className="neo-btn btn-pink" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', boxShadow: '2px 2px 0px #1E1E1E' }} onClick={() => setDashboardPreviewImg(null)}>
                <X size={14} /> Close
              </button>
            </div>
            <img src={dashboardPreviewImg} alt="Original health record" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', border: '3px solid #1E1E1E' }} />
          </div>
        </div>
      )}
    </div>
  );
};

// Styles
const emptyQueueContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4rem 1rem',
};

const dashboardGrid: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '1.5rem',
};

const abhaLinkedAlert: React.CSSProperties = {
  backgroundColor: '#ECFDF5',
  border: '2px solid #10B981',
  borderRadius: '4px',
  padding: '0.5rem 0.75rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '1rem',
};

const detailGrid: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '1.25rem',
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: '800',
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  marginBottom: '0.5rem',
  borderBottom: '2px solid #1E1E1E',
  paddingBottom: '0.2rem',
};

const summaryScrollBox: React.CSSProperties = {
  backgroundColor: '#FFFDEB',
  border: '2px solid #1E1E1E',
  padding: '0.75rem',
  borderRadius: '4px',
  minHeight: '380px',
  maxHeight: '440px',
  overflowY: 'auto',
};

const timelineBoxMini: React.CSSProperties = {
  backgroundColor: '#F9FAFB',
  border: '2px solid #1E1E1E',
  padding: '0.5rem',
  maxHeight: '180px',
  overflowY: 'auto',
  borderRadius: '4px',
};

const dotStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  backgroundColor: '#1E1E1E',
  borderRadius: '50%',
  position: 'absolute',
  left: '-5px',
  top: '3px',
};

const gemmaSummaryDashBox: React.CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.4rem',
  backgroundColor: '#FFFBEB',
  border: '1.5px dashed #D97706',
  borderRadius: '4px',
};

const confidenceDashStyle: React.CSSProperties = {
  marginTop: '0.4rem',
  padding: '0.35rem',
  backgroundColor: '#EEF2FF',
  border: '1.5px solid #1E1E1E',
  borderRadius: '4px',
  fontSize: '0.62rem',
  lineHeight: 1.45,
};

const attachedFileLinkStyle: React.CSSProperties = {
  marginTop: '0.25rem',
  border: '2px solid #1E1E1E',
  borderRadius: '4px',
  padding: '0.45rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.25rem',
  color: '#1E1E1E',
  backgroundColor: '#FFF',
  fontSize: '0.68rem',
  fontWeight: 800,
  textDecoration: 'none',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 2000,
  backdropFilter: 'blur(4px)',
};
