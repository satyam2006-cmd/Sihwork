import React, { useState, useEffect } from 'react';
import { Settings, Shield, Cpu, X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  interviewMode: 'simulated' | 'gemini' | 'browser';
  setInterviewMode: (mode: 'simulated' | 'gemini' | 'browser') => void;
  patientName: string;
  setPatientName: (name: string) => void;
  patientAge: number;
  setPatientAge: (age: number) => void;
  patientGender: string;
  setPatientGender: (gender: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  setApiKey,
  interviewMode,
  setInterviewMode,
  patientName,
  setPatientName,
  patientAge,
  setPatientAge,
  patientGender,
  setPatientGender,
}) => {
  const [localKey, setLocalKey] = useState(apiKey);
  const [localMode, setLocalMode] = useState(interviewMode);
  const [localName, setLocalName] = useState(patientName);
  const [localAge, setLocalAge] = useState(patientAge);
  const [localGender, setLocalGender] = useState(patientGender);

  useEffect(() => {
    setLocalKey(apiKey);
    setLocalMode(interviewMode);
    setLocalName(patientName);
    setLocalAge(patientAge);
    setLocalGender(patientGender);
  }, [isOpen, apiKey, interviewMode, patientName, patientAge, patientGender]);

  if (!isOpen) return null;

  const handleSave = () => {
    setApiKey(localKey);
    setInterviewMode(localMode);
    setPatientName(localName);
    setPatientAge(localAge);
    setPatientGender(localGender);
    localStorage.setItem('sih_gemini_api_key', localKey);
    localStorage.setItem('sih_interview_mode', localMode);
    localStorage.setItem('sih_patient_name', localName);
    localStorage.setItem('sih_patient_age', String(localAge));
    localStorage.setItem('sih_patient_gender', localGender);
    onClose();
  };

  return (
    <div style={modalOverlayStyle}>
      <div className="neo-card" style={modalContentStyle}>
        <div className="flex-between" style={{ marginBottom: '1.5rem', borderBottom: '3px solid #1E1E1E', paddingBottom: '0.75rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem' }}>
            <Settings size={28} /> HACKATHON SETTINGS
          </h2>
          <button onClick={onClose} className="neo-btn btn-pink" style={{ padding: '0.4rem', borderRadius: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div style={formGroupStyle}>
          <label style={labelStyle}>
            <Cpu size={18} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> INTERVIEW DRIVER MODE
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.50rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => setLocalMode('simulated')}
              className={`neo-btn ${localMode === 'simulated' ? 'btn-green' : 'btn-white'}`}
              style={{ padding: '0.6rem', textAlign: 'left', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}
            >
              <span>1. Static Branch Tree Simulator</span>
              <span className="neo-badge" style={{ fontSize: '0.55rem', padding: '0px 4px' }}>ZERO LATENCY</span>
            </button>
            <button
              onClick={() => setLocalMode('browser')}
              className={`neo-btn ${localMode === 'browser' ? 'btn-yellow' : 'btn-white'}`}
              style={{ padding: '0.6rem', textAlign: 'left', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}
            >
              <span>2. Background Browser Automation (ChatGPT Guest)</span>
              <span className="neo-badge" style={{ fontSize: '0.55rem', padding: '0px 4px' }}>KEYLESS LIVE AI</span>
            </button>
            <button
              onClick={() => setLocalMode('gemini')}
              className={`neo-btn ${localMode === 'gemini' ? 'btn-purple' : 'btn-white'}`}
              style={{ padding: '0.6rem', textAlign: 'left', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}
            >
              <span>3. Live Gemini REST API (Standard Key)</span>
              <span className="neo-badge" style={{ fontSize: '0.55rem', padding: '0px 4px' }}>FAST DIRECT API</span>
            </button>
          </div>
          <p style={helpTextStyle}>
            {localMode === 'simulated' && "No internet/server needed. Runs instant Branching logic using static transcripts, safe for bad Wi-Fi."}
            {localMode === 'browser' && "Launches headed Chromium in background (Node port 3001). Types prompts on chatgpt.com & returns structured response."}
            {localMode === 'gemini' && "Performs direct fetch requests online. Requires a developer Gemini API key."}
          </p>
        </div>

        {/* API Key */}
        {localMode === 'gemini' && (
          <div style={formGroupStyle}>
            <label style={labelStyle}>
              <Shield size={18} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> GEMINI API KEY
            </label>
            <input
              type="password"
              className="neo-input"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder="AIzaSy..."
              style={{ marginTop: '0.5rem' }}
            />
            <p style={helpTextStyle}>
              Get a free API key from Google AI Studio. Stored strictly in your browser's local storage.
            </p>
          </div>
        )}

        {/* Patient Mock Details */}
        <h3 style={{ margin: '1.25rem 0 0.5rem 0', borderBottom: '2px solid #1E1E1E', paddingBottom: '0.25rem' }}>
          PATIENT PROFILE FOR DEMO
        </h3>
        
        <div style={formRowStyle}>
          <div style={{ flex: 2 }}>
            <label style={labelStyle}>Patient Full Name</label>
            <input
              type="text"
              className="neo-input"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              style={{ marginTop: '0.25rem', height: '40px', padding: '0.5rem' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Age</label>
            <input
              type="number"
              className="neo-input"
              value={localAge}
              onChange={(e) => setLocalAge(Number(e.target.value))}
              style={{ marginTop: '0.25rem', height: '40px', padding: '0.5rem' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Gender</label>
            <select
              className="neo-select"
              value={localGender}
              onChange={(e) => setLocalGender(e.target.value)}
              style={{ marginTop: '0.25rem', height: '40px', padding: '0.25rem' }}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* Save controls */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button onClick={onClose} className="neo-btn btn-white" style={{ flex: 1 }}>
            Cancel
          </button>
          <button onClick={handleSave} className="neo-btn btn-yellow" style={{ flex: 2 }}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

// Styles
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)',
};

const modalContentStyle: React.CSSProperties = {
  width: '95%',
  maxWidth: '550px',
  boxShadow: '8px 8px 0px #1E1E1E',
  borderRadius: '0px',
  padding: '1.25rem'
};

const formGroupStyle: React.CSSProperties = {
  marginBottom: '1rem',
  display: 'flex',
  flexDirection: 'column',
};

const labelStyle: React.CSSProperties = {
  fontWeight: '700',
  fontSize: '0.9rem',
};

const helpTextStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#555',
  marginTop: '0.4rem',
  lineHeight: '1.3',
};

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  marginBottom: '0.5rem',
};
