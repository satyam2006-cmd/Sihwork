import React, { useState } from 'react';
import { Activity, ShieldCheck, FileText, Calendar, CheckSquare, Clock, AlertTriangle } from 'lucide-react';
import { PatientRecord, TriagePriority } from '../types/medical';

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
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: '1.4' }}>
                        {activePatient.summaryText || 'Generating summary...'}
                      </div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                      {activePatient.scannedDocs.map((doc) => (
                        <div key={doc.id} style={docChipStyle}>
                          <span style={{ fontSize: '0.7rem', fontWeight: '800' }}>📄 {doc.name}</span>
                          <span className="neo-badge badge-yellow" style={{ fontSize: '0.55rem', padding: '0.05rem 0.2rem' }}>
                            {doc.type.toUpperCase()}
                          </span>
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

const docChipStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.4rem',
  border: '1.5px solid #1E1E1E',
  backgroundColor: '#F3F4F6',
  borderRadius: '4px',
};
