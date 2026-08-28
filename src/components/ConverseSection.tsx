import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, AlertTriangle, CheckCircle, RefreshCw, Sparkles } from 'lucide-react';
import { SpeechTurn, TriagePriority } from '../types/medical';
import { callGeminiAPI, getMockResponse, callBrowserAutomationAPI } from '../utils/ai';

interface ConverseSectionProps {
  apiKey: string;
  interviewMode: 'simulated' | 'gemini' | 'browser';
  patientName: string;
  patientAge: number;
  patientGender: string;
  onInterviewComplete: (data: {
    chiefComplaint: string;
    hpi: string;
    redFlags: string[];
    triageLevel: TriagePriority;
    turns: SpeechTurn[];
  }) => void;
}

export const ConverseSection: React.FC<ConverseSectionProps> = ({
  apiKey,
  interviewMode,
  patientName,
  patientAge,
  patientGender,
  onInterviewComplete,
}) => {
  const [turns, setTurns] = useState<SpeechTurn[]>([]);
  const [currentAIQuestion, setCurrentAIQuestion] = useState(
    "Hello! I am your AI clinical assistant. What primary symptoms or medical concerns bring you to the clinic today?"
  );
  const [patientInput, setPatientInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Clinical states extracted
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [hpi, setHpi] = useState('');
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [triageLevel, setTriageLevel] = useState<TriagePriority>('LOW');
  const [isInterviewFinished, setIsInterviewFinished] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize Speech Synthesis & Speech Recognition
  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-IN'; // Indian-English or standard en-US

      rec.onstart = () => {
        setIsRecording(true);
      };

      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setPatientInput(text);
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }

    // Load initial greeting
    setTurns([
      {
        id: 'greet',
        sender: 'ai',
        text: "Hello! I am your AI clinical assistant. What primary symptoms or medical concerns bring you to the clinic today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    // Speak initial greeting
    speakText("Hello! I am your AI clinical assistant. What primary symptoms or medical concerns bring you to the clinic today?");

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Scroll chat on new turns
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const speakText = (text: string) => {
    if (isMuted || !synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Find an English voice
    const voices = synthRef.current.getVoices();
    const englishVoice = voices.find(v => v.lang.includes('en-IN')) || voices.find(v => v.lang.includes('en-US')) || voices[0];
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
    utterance.rate = 1.0;
    synthRef.current.speak(utterance);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted && synthRef.current) {
      synthRef.current.cancel();
    } else {
      speakText(currentAIQuestion);
    }
  };

  const startListening = () => {
    if (recognitionRef.current) {
      try {
        if (synthRef.current) synthRef.current.cancel();
        recognitionRef.current.start();
      } catch (e) {
        recognitionRef.current.stop();
      }
    } else {
      alert('Speech Recognition API not supported in this browser. Please type your response.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleSubmitPatientResponse = async () => {
    if (!patientInput.trim()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newPatientTurn: SpeechTurn = {
      id: `p-${Date.now()}`,
      sender: 'patient',
      text: patientInput,
      timestamp,
    };

    const updatedTurns = [...turns, newPatientTurn];
    setTurns(updatedTurns);
    setPatientInput('');
    setIsLoading(true);

    try {
      let aiResult;
      if (interviewMode === 'simulated') {
        aiResult = getMockResponse(updatedTurns);
      } else if (interviewMode === 'browser') {
        aiResult = await callBrowserAutomationAPI(updatedTurns);
      } else {
        aiResult = await callGeminiAPI(updatedTurns, apiKey);
      }

      // Update states
      setCurrentAIQuestion(aiResult.question);
      setChiefComplaint(aiResult.chiefComplaint);
      setHpi(aiResult.hpi);
      setRedFlags(aiResult.redFlags);
      setTriageLevel(aiResult.triageLevel);

      const nextAITurn: SpeechTurn = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiResult.question,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setTurns(prev => [...prev, nextAITurn]);
      speakText(aiResult.question);

      if (aiResult.finished) {
        setIsInterviewFinished(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (interviewMode === 'browser') {
      fetch('http://localhost:3001/api/reset', { method: 'POST' }).catch(err => console.error('Reset failed:', err));
    }
    setTurns([
      {
        id: 'greet',
        sender: 'ai',
        text: "Hello! I am your AI clinical assistant. What primary symptoms or medical concerns bring you to the clinic today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setCurrentAIQuestion("Hello! I am your AI clinical assistant. What primary symptoms or medical concerns bring you to the clinic today?");
    setChiefComplaint('');
    setHpi('');
    setRedFlags([]);
    setTriageLevel('LOW');
    setIsInterviewFinished(false);
    setPatientInput('');
    speakText("Hello! I am your AI clinical assistant. What primary symptoms or medical concerns bring you to the clinic today?");
  };

  const handleFinishInterview = () => {
    if (synthRef.current) synthRef.current.cancel();
    onInterviewComplete({
      chiefComplaint: chiefComplaint || "General checkup",
      hpi: hpi || "Interview closed.",
      redFlags,
      triageLevel,
      turns,
    });
  };

  // Helper for Neobrutalist Triage Colors
  const getTriageColorClass = (level: TriagePriority) => {
    switch (level) {
      case 'URGENT': return 'badge-red';
      case 'HIGH': return 'badge-pink';
      case 'MEDIUM': return 'badge-yellow';
      case 'LOW': return 'badge-green';
    }
  };

  return (
    <div className="neo-card" style={{ border: '3px solid #1E1E1E' }}>
      {/* Step Banner */}
      <div className="flex-between" style={{ marginBottom: '1rem', borderBottom: '3px solid #1E1E1E', paddingBottom: '0.75rem' }}>
        <div>
          <span className="neo-badge badge-yellow" style={{ marginRight: '0.5rem' }}>STEP 2</span>
          <span style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>ADAPTIVE CLINICAL INTERVIEW</span>
        </div>
        <div className="flex-gap">
          <button onClick={toggleMute} className="neo-btn btn-white" style={{ padding: '0.5rem', boxShadow: '2px 2px 0px #1E1E1E' }}>
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button onClick={handleReset} className="neo-btn btn-pink" style={{ padding: '0.5rem', boxShadow: '2px 2px 0px #1E1E1E' }} title="Reset Conversation">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Patient Profile Card (Subtle Neobrutalism) */}
      <div style={patientProfileStyle}>
        <div style={{ fontWeight: '800' }}>PATIENT PROFILE DIRECTIVE:</div>
        <div><strong>Name:</strong> {patientName} | <strong>Age:</strong> {patientAge} | <strong>Gender:</strong> {patientGender}</div>
      </div>

      {/* Flashing Red Flag Banner if urgent */}
      {redFlags.length > 0 && (
        <div className="neo-alert alert-danger animate-pulse-slow" style={{ border: '3px solid #1E1E1E', boxShadow: '4px 4px 0 #1E1E1E' }}>
          <AlertTriangle size={24} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: '800', fontSize: '1.05rem' }}>CRITICAL RED FLAG DETECTED - ROUTED TO PRIORITY TRIAGE</div>
            <div style={{ fontSize: '0.85rem' }}>
              High risk indicators: {redFlags.join(', ')}. Clinical interview shortened to minimize delay in care.
            </div>
          </div>
        </div>
      )}

      {/* Conversation Transcripts Box */}
      <div style={chatContainerStyle}>
        {turns.map((turn) => (
          <div key={turn.id} style={turn.sender === 'ai' ? aiBubbleRowStyle : patientBubbleRowStyle}>
            <div
              className="neo-card"
              style={{
                ...bubbleStyle,
                backgroundColor: turn.sender === 'ai' ? '#FFF' : '#C084FC',
                borderColor: '#1E1E1E',
                boxShadow: turn.sender === 'ai' ? '2px 2px 0px #1E1E1E' : '-2px 2px 0px #1E1E1E',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: '800', marginBottom: '0.25rem', color: '#1E1E1E' }}>
                {turn.sender === 'ai' ? '🤖 CLINICAL AI' : `👤 ${patientName.toUpperCase()}`}
              </div>
              <div style={{ fontWeight: '500', fontSize: '0.95rem', lineHeight: '1.4' }}>{turn.text}</div>
              <div style={{ fontSize: '0.65rem', textAlign: 'right', marginTop: '0.25rem', opacity: 0.7 }}>
                {turn.timestamp}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={aiBubbleRowStyle}>
            <div className="neo-card animate-pulse-slow" style={{ ...bubbleStyle, backgroundColor: '#FFFFFF', boxShadow: '2px 2px 0px #1E1E1E' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '800' }}>AI ANALYZING CLINICAL CLUES...</div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Speech input Controller / Manual typing box */}
      {!isInterviewFinished ? (
        <div style={{ marginTop: '1rem' }}>
          {/* Wave animator */}
          {isRecording && (
            <div style={waveContainerStyle}>
              <div style={{ ...waveBar, animationDelay: '0s' }} />
              <div style={{ ...waveBar, animationDelay: '0.15s' }} />
              <div style={{ ...waveBar, animationDelay: '0.3s' }} />
              <div style={{ ...waveBar, animationDelay: '0.45s' }} />
              <div style={{ ...waveBar, animationDelay: '0.6s' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: '700', marginLeft: '0.5rem' }}>AI LISTENING... SPEAK NOW</span>
            </div>
          )}

          {/* Input & Record Bar */}
          <div style={inputBarContainerStyle}>
            <button
              onClick={isRecording ? stopListening : startListening}
              className={`neo-btn ${isRecording ? 'btn-red' : 'btn-purple'}`}
              style={{ flexShrink: 0, height: '48px', width: '48px', padding: 0 }}
              title={isRecording ? "Stop recording" : "Speak response"}
            >
              {isRecording ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <input
              type="text"
              className="neo-input"
              value={patientInput}
              onChange={(e) => setPatientInput(e.target.value)}
              placeholder="Speak using mic, or type details here (Adaptive Voice + Touch)..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitPatientResponse();
              }}
              style={{ flex: 1, height: '48px' }}
            />
            <button
              onClick={handleSubmitPatientResponse}
              className="neo-btn btn-yellow"
              style={{ flexShrink: 0, height: '48px', width: '48px', padding: 0 }}
              disabled={!patientInput.trim()}
            >
              <Send size={20} />
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.5rem' }}>
            ℹ️ Press <strong>Space</strong> or Click the microphone to talk. You can edit the transcript text by typing in the box before sending.
          </p>
        </div>
      ) : (
        <div className="neo-alert alert-success" style={{ marginTop: '1.5rem', border: '3px solid #1E1E1E', flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <CheckCircle size={22} />
            <span style={{ fontWeight: '800', fontSize: '1.1rem' }}>INTERVIEW COMPLETED SUCCESSFULLY!</span>
          </div>
          
          <div style={{ margin: '1rem 0', fontSize: '0.9rem', border: '2px solid #1E1E1E', padding: '0.75rem', backgroundColor: '#FFF', borderRadius: '4px' }}>
            <div style={{ marginBottom: '0.4rem' }}>
              <strong>Triage Category:</strong> <span className={`neo-badge ${getTriageColorClass(triageLevel)}`}>{triageLevel} Priority</span>
            </div>
            <div style={{ marginBottom: '0.4rem' }}>
              <strong>Chief Complaint:</strong> {chiefComplaint}
            </div>
            <div>
              <strong>Structured HPI Snippet:</strong>
              <div style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.2rem', color: '#333', whiteSpace: 'pre-wrap' }}>
                {hpi}
              </div>
            </div>
          </div>

          <button onClick={handleFinishInterview} className="neo-btn btn-yellow" style={{ width: '100%', padding: '0.85rem' }}>
            Proceed to Step 3: Scan Medical Records <Sparkles size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

// Styles
const patientProfileStyle: React.CSSProperties = {
  backgroundColor: '#FFF',
  border: '2px solid #1E1E1E',
  borderRadius: '4px',
  padding: '0.5rem 0.75rem',
  marginBottom: '1rem',
  fontSize: '0.85rem',
  lineHeight: '1.4',
};

const chatContainerStyle: React.CSSProperties = {
  border: '3px solid #1E1E1E',
  height: '350px',
  overflowY: 'auto',
  padding: '1rem',
  backgroundColor: '#F9FAFB',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const aiBubbleRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
  width: '100%',
};

const patientBubbleRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  width: '100%',
};

const bubbleStyle: React.CSSProperties = {
  maxWidth: '85%',
  margin: 0,
  padding: '0.75rem 1rem',
  borderRadius: '4px', // Hard neobrutal edges
};

const inputBarContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'center',
};

const waveContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  marginBottom: '0.5rem',
  padding: '0.4rem',
  backgroundColor: '#FEE2E2',
  border: '2px solid #FF8E9E',
  borderRadius: '4px',
};

const waveBar: React.CSSProperties = {
  width: '4px',
  height: '18px',
  backgroundColor: '#EF4444',
  animation: 'pulse 1s ease-in-out infinite',
  borderRadius: '2px',
};
