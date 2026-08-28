import React, { useEffect, useState } from 'react';
import { Activity, Languages, LockKeyhole, LogIn, Settings, ShieldCheck, User, UserPlus } from 'lucide-react';
import { AppLanguageCode, PatientRecord, ScannedDoc, TimelineEvent, TriagePriority } from './types/medical';
import { ConverseSection } from './components/ConverseSection';
import { ScanSection } from './components/ScanSection';
import { SummarizeRouteSection } from './components/SummarizeRouteSection';
import { DoctorDashboard } from './components/DoctorDashboard';
import { SettingsModal } from './components/SettingsModal';
import { APP_LANGUAGES, DEFAULT_LANGUAGE_CODE, getPatientUiCopy } from './utils/language';

const OTHER_LANGUAGE_OPTIONS = [
  'Assamese',
  'Bengali',
  'Bhojpuri',
  'Kannada',
  'Kashmiri',
  'Konkani',
  'Maithili',
  'Malayalam',
  'Manipuri',
  'Nepali',
  'Odia',
  'Punjabi',
  'Sanskrit',
  'Santali',
  'Sindhi',
  'Tamil',
  'Telugu',
  'Urdu',
];

const SAMPLE_PATIENT_LOGIN = {
  abhaId: '91-8843-1250-9982',
  email: 'mohak@medpulse.local',
  password: 'patient123',
};

const SAMPLE_DOCTOR_LOGIN = {
  email: 'doctor@medpulse.local',
  password: 'doctor123',
};

interface AuthUser {
  id: string;
  role: 'patient' | 'doctor';
  name: string;
  email: string;
  abhaId: string;
  age: number;
  gender: string;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(response.ok
      ? 'Backend returned HTML instead of JSON. Make sure the API server is running on port 3001.'
      : `Backend request failed with a non-JSON response (${response.status}).`);
  }
}

export const App: React.FC = () => {
  // Navigation & Modal toggles
  const [activeTab, setActiveTab] = useState<'patient' | 'doctor'>('patient');
  const [activeStep, setActiveStep] = useState<2 | 3 | 4>(2);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPatientSessionStarted, setIsPatientSessionStarted] = useState(false);

  // Settings & Patient configs (saved in localStorage)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('sih_gemini_api_key') || '');
  const [interviewMode, setInterviewMode] = useState<'simulated' | 'browser'>(() => {
    const val = localStorage.getItem('sih_interview_mode');
    if (val === 'browser' || val === 'simulated') return val;
    return 'simulated';
  });
  const [patientName, setPatientName] = useState(() => localStorage.getItem('sih_patient_name') || 'Satya Narayana');
  const [patientAge, setPatientAge] = useState(() => Number(localStorage.getItem('sih_patient_age')) || 45);
  const [patientGender, setPatientGender] = useState(() => localStorage.getItem('sih_patient_gender') || 'Male');
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguageCode>(() => {
    const val = localStorage.getItem('sih_patient_language') as AppLanguageCode | null;
    return APP_LANGUAGES.some(language => language.code === val) ? val! : DEFAULT_LANGUAGE_CODE;
  });
  const [otherLanguageName, setOtherLanguageName] = useState(() => localStorage.getItem('sih_patient_other_language') || '');
  const otherLanguageInputRef = React.useRef<HTMLInputElement>(null);
  const copy = getPatientUiCopy(selectedLanguage);
  const [patientAuthUser, setPatientAuthUser] = useState<AuthUser | null>(null);
  const [doctorAuthUser, setDoctorAuthUser] = useState<AuthUser | null>(null);
  const [patientAuthMode, setPatientAuthMode] = useState<'login' | 'signup'>('login');
  const [patientLoginMethod, setPatientLoginMethod] = useState<'abha' | 'email'>('abha');
  const [patientAuthForm, setPatientAuthForm] = useState({
    name: patientName,
    email: '',
    password: '',
    abhaId: '',
    age: patientAge,
    gender: patientGender,
  });
  const [doctorLoginForm, setDoctorLoginForm] = useState({
    email: SAMPLE_DOCTOR_LOGIN.email,
    password: SAMPLE_DOCTOR_LOGIN.password,
  });
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (selectedLanguage !== 'other') return;
    if ((window as any).google?.translate?.TranslateElement) return;

    (window as any).googleTranslateElementInit = () => {
      new (window as any).google.translate.TranslateElement(
        { pageLanguage: 'en', includedLanguages: '', autoDisplay: false },
        'google_translate_element'
      );
    };

    const existingScript = document.querySelector('script[src*="translate.google.com/translate_a/element.js"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.body.appendChild(script);
    }
  }, [selectedLanguage]);

  // Patients database state loaded from the local server database
  const [patients, setPatients] = useState<PatientRecord[]>([]);

  useEffect(() => {
    fetch('http://localhost:3001/api/patients')
      .then(async response => {
        const data = await readJsonResponse(response);
        if (!response.ok) {
          throw new Error(data.error || 'Patient DB offline');
        }
        return data;
      })
      .then(data => {
        if (Array.isArray(data.patients)) {
          setPatients(data.patients);
        }
      })
      .catch(error => {
        console.warn('Patient database unavailable; dashboard will show only this session until server is running.', error);
      });
  }, []);

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
  const handleRouteComplete = async (newPatient: PatientRecord) => {
    try {
      const response = await fetch('http://localhost:3001/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient: newPatient }),
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Patient DB save failed');
      }
    } catch (error) {
      console.warn('Patient database save unavailable; keeping patient in current browser session.', error);
    }

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
    setIsPatientSessionStarted(false);
  };

  const handleStartPatientSession = () => {
    if (!patientAuthUser) {
      alert('Please login or sign up before starting patient check-in.');
      return;
    }
    if (selectedLanguage === 'other' && !otherLanguageName.trim()) {
      alert('Please type or select the patient language first.');
      return;
    }
    localStorage.setItem('sih_patient_language', selectedLanguage);
    localStorage.setItem('sih_patient_other_language', otherLanguageName.trim());
    setIsPatientSessionStarted(true);
    setActiveStep(2);
  };

  const applyPatientUser = (user: AuthUser) => {
    setPatientAuthUser(user);
    setPatientName(user.name || patientName);
    setPatientAge(user.age || patientAge);
    setPatientGender(user.gender || patientGender);
    localStorage.setItem('sih_patient_name', user.name || patientName);
    localStorage.setItem('sih_patient_age', String(user.age || patientAge));
    localStorage.setItem('sih_patient_gender', user.gender || patientGender);
    setAuthError('');
  };

  const handlePatientAuth = async () => {
    setAuthError('');
    const endpoint = patientAuthMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const payload = patientAuthMode === 'signup'
      ? {
          name: patientAuthForm.name,
          email: patientAuthForm.email,
          password: patientAuthForm.password,
          abhaId: patientAuthForm.abhaId,
          age: patientAuthForm.age,
          gender: patientAuthForm.gender,
        }
      : patientLoginMethod === 'abha'
        ? { role: 'patient', abhaId: patientAuthForm.abhaId }
        : { role: 'patient', email: patientAuthForm.email, password: patientAuthForm.password };

    try {
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Patient access failed.');
      applyPatientUser(data.user);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Patient access failed.');
    }
  };

  const handleDoctorLogin = async () => {
    setAuthError('');
    try {
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'doctor', email: doctorLoginForm.email, password: doctorLoginForm.password }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Doctor login failed.');
      setDoctorAuthUser(data.user);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Doctor login failed.');
    }
  };

  const fillSamplePatientLogin = () => {
    setPatientAuthMode('login');
    setPatientLoginMethod('abha');
    setPatientAuthForm(prev => ({
      ...prev,
      abhaId: SAMPLE_PATIENT_LOGIN.abhaId,
      email: SAMPLE_PATIENT_LOGIN.email,
      password: SAMPLE_PATIENT_LOGIN.password,
    }));
    setAuthError('');
  };

  const fillSampleDoctorLogin = () => {
    setDoctorLoginForm(SAMPLE_DOCTOR_LOGIN);
    setAuthError('');
  };

  return (
    <div>
      {/* Neobrutalist Header Banner */}
      <header className="neo-header" style={{ borderBottom: '4px solid #1E1E1E' }}>
        <div className="container flex-between" style={{ padding: '0.2rem 1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚡ MEDPULSE AI
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
            <User size={18} /> {copy.patientFlow}
          </button>
          <button
            onClick={() => setActiveTab('doctor')}
            className={`neo-btn ${activeTab === 'doctor' ? 'btn-purple' : 'btn-white'}`}
            style={activeTab === 'doctor' ? tabActiveStyle : tabInactiveStyle}
          >
            <Activity size={18} /> {copy.doctorDashboard} ({patients.length})
          </button>
        </div>

        {/* Tab workspace Panels */}
        {activeTab === 'patient' ? (
          <div>
            {!patientAuthUser ? (
              <div className="neo-card" style={authCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                  {patientAuthMode === 'login' ? <LogIn size={26} /> : <UserPlus size={26} />}
                  <h2 style={{ fontSize: '1.45rem', fontFamily: 'var(--font-display)' }}>
                    {patientAuthMode === 'login' ? 'Patient Login' : 'Patient Sign Up'}
                  </h2>
                </div>

                <div style={authToggleStyle}>
                  <button onClick={() => setPatientAuthMode('login')} className={`neo-btn ${patientAuthMode === 'login' ? 'btn-yellow' : 'btn-white'}`} style={authSmallButtonStyle}>Login</button>
                  <button onClick={() => setPatientAuthMode('signup')} className={`neo-btn ${patientAuthMode === 'signup' ? 'btn-green' : 'btn-white'}`} style={authSmallButtonStyle}>Sign Up</button>
                </div>

                {patientAuthMode === 'login' && (
                  <div style={sampleCredentialBoxStyle}>
                    <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Sample patient sign-in</div>
                    <div>ABHA: <strong>{SAMPLE_PATIENT_LOGIN.abhaId}</strong></div>
                    <div>Email: <strong>{SAMPLE_PATIENT_LOGIN.email}</strong></div>
                    <div>Password: <strong>{SAMPLE_PATIENT_LOGIN.password}</strong></div>
                    <button onClick={fillSamplePatientLogin} className="neo-btn btn-white" style={sampleFillButtonStyle}>
                      Use Sample Patient
                    </button>
                  </div>
                )}

                {patientAuthMode === 'login' ? (
                  <>
                    <div style={authToggleStyle}>
                      <button onClick={() => setPatientLoginMethod('abha')} className={`neo-btn ${patientLoginMethod === 'abha' ? 'btn-purple' : 'btn-white'}`} style={authSmallButtonStyle}>ABHA ID</button>
                      <button onClick={() => setPatientLoginMethod('email')} className={`neo-btn ${patientLoginMethod === 'email' ? 'btn-purple' : 'btn-white'}`} style={authSmallButtonStyle}>Email</button>
                    </div>
                    {patientLoginMethod === 'abha' ? (
                      <input
                        className="neo-input"
                        value={patientAuthForm.abhaId}
                        onChange={(e) => setPatientAuthForm(prev => ({ ...prev, abhaId: e.target.value }))}
                        placeholder="ABHA ID"
                        style={authInputStyle}
                      />
                    ) : (
                      <div style={authFieldStackStyle}>
                        <input className="neo-input" value={patientAuthForm.email} onChange={(e) => setPatientAuthForm(prev => ({ ...prev, email: e.target.value }))} placeholder="Email" style={authInputStyle} />
                        <input className="neo-input" type="password" value={patientAuthForm.password} onChange={(e) => setPatientAuthForm(prev => ({ ...prev, password: e.target.value }))} placeholder="Password" style={authInputStyle} />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={authFieldStackStyle}>
                    <input className="neo-input" value={patientAuthForm.name} onChange={(e) => setPatientAuthForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Full name" style={authInputStyle} />
                    <input className="neo-input" value={patientAuthForm.abhaId} onChange={(e) => setPatientAuthForm(prev => ({ ...prev, abhaId: e.target.value }))} placeholder="ABHA ID" style={authInputStyle} />
                    <input className="neo-input" value={patientAuthForm.email} onChange={(e) => setPatientAuthForm(prev => ({ ...prev, email: e.target.value }))} placeholder="Email" style={authInputStyle} />
                    <input className="neo-input" type="password" value={patientAuthForm.password} onChange={(e) => setPatientAuthForm(prev => ({ ...prev, password: e.target.value }))} placeholder="Password" style={authInputStyle} />
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <input className="neo-input" type="number" value={patientAuthForm.age} onChange={(e) => setPatientAuthForm(prev => ({ ...prev, age: Number(e.target.value) }))} placeholder="Age" style={{ ...authInputStyle, flex: 1 }} />
                      <select className="neo-select" value={patientAuthForm.gender} onChange={(e) => setPatientAuthForm(prev => ({ ...prev, gender: e.target.value }))} style={{ ...authInputStyle, flex: 1 }}>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                )}

                {authError && <div style={authErrorStyle}>{authError}</div>}
                <button onClick={handlePatientAuth} className="neo-btn btn-green" style={{ marginTop: '1rem', width: '100%', padding: '0.9rem' }}>
                  {patientAuthMode === 'login' ? 'Unlock Patient Check-In' : 'Create Patient Account'}
                </button>
              </div>
            ) : !isPatientSessionStarted ? (
              <div className="neo-card" style={languageGateStyle}>
                <div style={{ marginBottom: '0.75rem', fontSize: '0.82rem', fontWeight: 800, color: '#059669' }}>
                  Logged in as {patientAuthUser.name} {patientAuthUser.abhaId ? `(ABHA: ${patientAuthUser.abhaId})` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <Languages size={26} />
                  <h2 style={{ fontSize: '1.45rem', fontFamily: 'var(--font-display)' }}>{copy.chooseLanguage}</h2>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#444', marginBottom: '1rem' }}>{copy.languageHelp}</p>
                <div style={languageGridStyle}>
                  {APP_LANGUAGES.map(language => (
                    <button
                      key={language.code}
                      onClick={() => {
                        setSelectedLanguage(language.code);
                        if (language.code === 'other') {
                          window.setTimeout(() => otherLanguageInputRef.current?.focus(), 0);
                        }
                      }}
                      className={`neo-btn ${selectedLanguage === language.code ? 'btn-yellow' : 'btn-white'}`}
                      style={{
                        padding: '0.9rem',
                        justifyContent: 'space-between',
                        boxShadow: selectedLanguage === language.code ? '2px 2px 0px #1E1E1E' : '4px 4px 0px #1E1E1E'
                      }}
                    >
                      <span>{language.nativeLabel}</span>
                      <span style={{ fontSize: '0.75rem', color: '#444' }}>{language.label}</span>
                    </button>
                  ))}
                </div>
                {selectedLanguage === 'other' && (
                  <div style={otherLanguageBoxStyle}>
                    <label style={{ fontWeight: 800, fontSize: '0.85rem' }}>Type or select patient language</label>
                    <input
                      ref={otherLanguageInputRef}
                      className="neo-input"
                      list="other-language-options"
                      value={otherLanguageName}
                      onChange={(e) => setOtherLanguageName(e.target.value)}
                      placeholder="Start typing, e.g. Telugu"
                      style={{ marginTop: '0.4rem', height: '42px', padding: '0.55rem' }}
                    />
                    <datalist id="other-language-options">
                      {OTHER_LANGUAGE_OPTIONS.map(language => (
                        <option key={language} value={language} />
                      ))}
                    </datalist>
                    <div id="google_translate_element" style={{ marginTop: '0.65rem' }} />
                    <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#555', lineHeight: 1.35 }}>
                      Pick from suggestions or type any language. The interview AI will use that language for patient questions.
                    </p>
                  </div>
                )}
                <button onClick={handleStartPatientSession} className="neo-btn btn-green" style={{ marginTop: '1.25rem', width: '100%', padding: '0.95rem' }}>
                  {copy.startSession}
                </button>
              </div>
            ) : (
            <>
            {/* Step Indicators bar */}
            <div style={stepIndicatorsBar}>
              <div style={{ ...stepBadge, backgroundColor: activeStep === 2 ? '#FFE800' : '#FFF' }}>
                <span style={{ fontWeight: '800' }}>STEP 2:</span> {copy.stepConverse}
              </div>
              <div style={{ ...stepBadge, backgroundColor: activeStep === 3 ? '#FF8E9E' : '#FFF' }}>
                <span style={{ fontWeight: '800' }}>STEP 3:</span> {copy.stepScan}
              </div>
              <div style={{ ...stepBadge, backgroundColor: activeStep === 4 ? '#C084FC' : '#FFF' }}>
                <span style={{ fontWeight: '800' }}>STEP 4:</span> {copy.stepRoute}
              </div>
            </div>

            {/* Rendering active checking step */}
            {activeStep === 2 && (
              <ConverseSection
                interviewMode={interviewMode}
                patientName={patientName}
                patientAge={patientAge}
                patientGender={patientGender}
                languageCode={selectedLanguage}
                otherLanguageName={otherLanguageName}
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
                languageCode={selectedLanguage}
                otherLanguageName={otherLanguageName}
                chiefComplaint={chiefComplaint}
                hpi={hpi}
                redFlags={redFlags}
                triageLevel={triageLevel}
                scannedDocs={scannedDocs}
                timeline={timeline}
                onRouteComplete={handleRouteComplete}
              />
            )}
            </>
            )}
          </div>
        ) : (
          doctorAuthUser ? (
            <DoctorDashboard
              patients={patients}
              onConsultPatient={(id) => {
                fetch(`http://localhost:3001/api/patients/${encodeURIComponent(id)}`, { method: 'DELETE' })
                  .catch(error => console.warn('Patient database delete unavailable; removing locally only.', error));
                setPatients(prev => prev.filter(p => p.id !== id));
              }}
            />
          ) : (
            <div className="neo-card" style={authCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                <LockKeyhole size={26} />
                <h2 style={{ fontSize: '1.45rem', fontFamily: 'var(--font-display)' }}>Doctor Portal Login</h2>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#555', lineHeight: 1.35, marginBottom: '0.9rem' }}>
                Physician consultation desk is locked. Use doctor credentials to view routed patient entries.
              </p>
              <div style={sampleCredentialBoxStyle}>
                <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Sample doctor sign-in</div>
                <div>Email: <strong>{SAMPLE_DOCTOR_LOGIN.email}</strong></div>
                <div>Password: <strong>{SAMPLE_DOCTOR_LOGIN.password}</strong></div>
                <button onClick={fillSampleDoctorLogin} className="neo-btn btn-white" style={sampleFillButtonStyle}>
                  Use Sample Doctor
                </button>
              </div>
              <div style={authFieldStackStyle}>
                <input
                  className="neo-input"
                  value={doctorLoginForm.email}
                  onChange={(e) => setDoctorLoginForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Doctor email"
                  style={authInputStyle}
                />
                <input
                  className="neo-input"
                  type="password"
                  value={doctorLoginForm.password}
                  onChange={(e) => setDoctorLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Password"
                  style={authInputStyle}
                />
              </div>
              {authError && <div style={authErrorStyle}>{authError}</div>}
              <button onClick={handleDoctorLogin} className="neo-btn btn-purple" style={{ marginTop: '1rem', width: '100%', padding: '0.9rem' }}>
                <ShieldCheck size={18} /> Unlock Doctor Portal
              </button>
            </div>
          )
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

const languageGateStyle: React.CSSProperties = {
  border: '3px solid #1E1E1E',
  maxWidth: '720px',
  margin: '0 auto',
  padding: '1.4rem',
};

const languageGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: '0.75rem',
};

const otherLanguageBoxStyle: React.CSSProperties = {
  marginTop: '1rem',
  border: '2px solid #1E1E1E',
  borderRadius: '4px',
  padding: '0.9rem',
  backgroundColor: '#FFF',
};

const authCardStyle: React.CSSProperties = {
  border: '3px solid #1E1E1E',
  maxWidth: '560px',
  margin: '0 auto',
  padding: '1.4rem',
};

const authToggleStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  marginBottom: '0.9rem',
};

const authSmallButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.65rem',
  boxShadow: '3px 3px 0px #1E1E1E',
};

const authFieldStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const authInputStyle: React.CSSProperties = {
  height: '42px',
  padding: '0.55rem',
};

const authErrorStyle: React.CSSProperties = {
  marginTop: '0.85rem',
  padding: '0.55rem 0.75rem',
  border: '2px solid #E11D48',
  backgroundColor: '#FFF1F2',
  color: '#9F1239',
  borderRadius: '4px',
  fontSize: '0.78rem',
  fontWeight: 800,
};

const sampleCredentialBoxStyle: React.CSSProperties = {
  marginBottom: '0.9rem',
  padding: '0.65rem 0.75rem',
  border: '2px solid #1E1E1E',
  backgroundColor: '#FFFDEB',
  borderRadius: '4px',
  fontSize: '0.76rem',
  lineHeight: 1.45,
};

const sampleFillButtonStyle: React.CSSProperties = {
  marginTop: '0.55rem',
  width: '100%',
  padding: '0.45rem',
  fontSize: '0.72rem',
  boxShadow: '2px 2px 0px #1E1E1E',
};
