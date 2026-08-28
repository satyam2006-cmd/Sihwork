import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, AlertTriangle, CheckCircle, RefreshCw, Sparkles, Trash2, PlayCircle } from 'lucide-react';
import { AppLanguageCode, SpeechTurn, TriagePriority } from '../types/medical';
import { getMockResponse, callBrowserAutomationAPI, startBrowserInterviewSession } from '../utils/ai';
import { getGoogleTtsLanguage, getInitialGreeting, getPatientUiCopy, getSpeechRecognitionLanguage } from '../utils/language';

interface ConverseSectionProps {
  interviewMode: 'simulated' | 'browser';
  patientName: string;
  patientAge: number;
  patientGender: string;
  languageCode: AppLanguageCode;
  otherLanguageName: string;
  onInterviewComplete: (data: {
    chiefComplaint: string;
    hpi: string;
    redFlags: string[];
    triageLevel: TriagePriority;
    turns: SpeechTurn[];
  }) => void;
}

export const ConverseSection: React.FC<ConverseSectionProps> = ({
  interviewMode,
  patientName,
  patientAge,
  patientGender,
  languageCode,
  otherLanguageName,
  onInterviewComplete,
}) => {
  const copy = getPatientUiCopy(languageCode);
  const initialGreeting = getInitialGreeting(languageCode);
  const [turns, setTurns] = useState<SpeechTurn[]>([]);
  const [currentAIQuestion, setCurrentAIQuestion] = useState(initialGreeting);
  const [patientInput, setPatientInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [listeningStatus, setListeningStatus] = useState('Mic idle');
  const [aiBackendStatus, setAiBackendStatus] = useState('Simulator ready');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');

  // Clinical states extracted
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [hpi, setHpi] = useState('');
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [triageLevel, setTriageLevel] = useState<TriagePriority>('LOW');
  const [isInterviewFinished, setIsInterviewFinished] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const speechBaseRef = useRef('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRequestRef = useRef(0);

  // Initialize Speech Synthesis & Speech Recognition
  useEffect(() => {
    synthRef.current = window.speechSynthesis;

    const refreshVoices = () => {
      if (!synthRef.current) return;
      const voices = synthRef.current.getVoices();
      setAvailableVoices(voices);
      if (!selectedVoiceName && voices.length > 0) {
        const preferredVoice = chooseBestVoice(voices, languageCode);
        if (preferredVoice) setSelectedVoiceName(preferredVoice.name);
      }
    };

    refreshVoices();
    if (synthRef.current) {
      synthRef.current.onvoiceschanged = refreshVoices;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = getSpeechRecognitionLanguage(languageCode);

      rec.onstart = () => {
        setIsRecording(true);
        setListeningStatus('Listening...');
      };

      rec.onresult = (event: any) => {
        const finalPhrases: string[] = [];
        const interimPhrases: string[] = [];
        for (let i = 0; i < event.results.length; i += 1) {
          const phrase = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalPhrases.push(phrase);
          } else {
            interimPhrases.push(phrase);
          }
        }
        const transcript = [
          speechBaseRef.current,
          finalPhrases.join(' '),
          interimPhrases.join(' ')
        ].join(' ');
        setPatientInput(cleanTranscript(transcript));
        setListeningStatus(interimPhrases.length > 0 ? 'Listening to live speech...' : 'Captured speech. Keep talking or stop.');
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e);
        setIsRecording(false);
        setListeningStatus(`Mic error: ${e.error || 'unknown'}`);
      };

      rec.onend = () => {
        setIsRecording(false);
        setPatientInput(prev => cleanTranscript(prev));
        setListeningStatus('Mic stopped. Review the text, then send.');
      };

      recognitionRef.current = rec;
    }

    // Load initial greeting
    setTurns([
      {
        id: 'greet',
        sender: 'ai',
        text: initialGreeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    if (interviewMode === 'browser') {
      startBrowserInterviewSession({ name: patientName, age: patientAge, gender: patientGender, languageCode, otherLanguageName }).then(ok => {
        setAiBackendStatus(ok ? 'ChatGPT browser session ready' : 'ChatGPT backend offline; using local Qwen/Ollama fallback');
      });
    } else {
      setAiBackendStatus('Simulator ready');
    }

    speakText(initialGreeting);

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
        synthRef.current.onvoiceschanged = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Scroll chat on new turns
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const speakText = async (text: string) => {
    if (isMuted) return;
    const requestId = speechRequestRef.current + 1;
    speechRequestRef.current = requestId;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (await speakWithGoogleTts(text, languageCode, otherLanguageName, audioRef, speechRequestRef, requestId)) return;
    if (!synthRef.current) return;
    if (speechRequestRef.current !== requestId) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synthRef.current.getVoices();
    const selectedVoice = voices.find(v => v.name === selectedVoiceName) || chooseBestVoice(voices, languageCode);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }
    utterance.rate = 0.92;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    synthRef.current.speak(utterance);
  };

  const replayAgentVoice = () => {
    speakText(currentAIQuestion);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted && synthRef.current) {
      speechRequestRef.current += 1;
      synthRef.current.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } else {
      speakText(currentAIQuestion);
    }
  };

  const startListening = () => {
    if (recognitionRef.current) {
      try {
        if (synthRef.current) synthRef.current.cancel();
        speechRequestRef.current += 1;
        if (audioRef.current) audioRef.current.pause();
        speechBaseRef.current = patientInput.trim();
        setListeningStatus('Starting mic...');
        recognitionRef.current.start();
      } catch (e) {
        recognitionRef.current.stop();
        setListeningStatus('Restarting mic...');
        window.setTimeout(() => {
          try {
            speechBaseRef.current = patientInput.trim();
            recognitionRef.current?.start();
          } catch (err) {
            console.error('Mic restart failed:', err);
            setListeningStatus('Mic could not restart. Please type instead.');
          }
        }, 250);
      }
    } else {
      alert('Speech Recognition API not supported in this browser. Please type your response.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListeningStatus('Stopping mic...');
    }
  };

  const clearPatientInput = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
    speechBaseRef.current = '';
    setPatientInput('');
    setListeningStatus('Cleared. Ready for a fresh answer.');
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
    speechBaseRef.current = '';
    setIsLoading(true);

    try {
      let aiResult;
      if (interviewMode === 'simulated') {
        aiResult = getMockResponse(updatedTurns, languageCode);
      } else {
        setAiBackendStatus('Asking AI...');
        aiResult = await callBrowserAutomationAPI(updatedTurns, languageCode, otherLanguageName);
      }
      if (interviewMode === 'browser') {
        setAiBackendStatus('AI response received');
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
        text: initialGreeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setCurrentAIQuestion(initialGreeting);
    setChiefComplaint('');
    setHpi('');
    setRedFlags([]);
    setTriageLevel('LOW');
    setIsInterviewFinished(false);
    setPatientInput('');
    speechBaseRef.current = '';
    setListeningStatus('Mic idle');
    if (interviewMode === 'browser') {
      startBrowserInterviewSession({ name: patientName, age: patientAge, gender: patientGender, languageCode, otherLanguageName }).then(ok => {
        setAiBackendStatus(ok ? 'ChatGPT browser session ready' : 'ChatGPT backend offline; using local Qwen/Ollama fallback');
      });
    } else {
      setAiBackendStatus('Simulator ready');
    }
    speakText(initialGreeting);
  };

  const handleFinishInterview = () => {
    speechRequestRef.current += 1;
    if (synthRef.current) synthRef.current.cancel();
    if (audioRef.current) audioRef.current.pause();
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
          <span style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>{copy.interviewTitle}</span>
        </div>
        <div className="flex-gap">
          <select
            className="neo-input"
            value={selectedVoiceName}
            onChange={(e) => setSelectedVoiceName(e.target.value)}
            style={{ height: '38px', minWidth: '190px', fontSize: '0.75rem', padding: '0.35rem' }}
            title="Interviewer voice"
          >
            {availableVoices.length === 0 ? (
              <option value="">Default voice</option>
            ) : (
              availableVoices.map((voice) => (
                <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))
            )}
          </select>
          <button onClick={replayAgentVoice} className="neo-btn btn-white" style={{ padding: '0.5rem', boxShadow: '2px 2px 0px #1E1E1E' }} title="Replay interviewer voice">
            <PlayCircle size={18} />
          </button>
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
        <div style={{ fontWeight: '800' }}>{copy.profileDirective}:</div>
        <div><strong>Name:</strong> {patientName} | <strong>Age:</strong> {patientAge} | <strong>Gender:</strong> {patientGender}</div>
        <div><strong>{copy.aiBackend}:</strong> {aiBackendStatus}</div>
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
                {turn.sender === 'ai' ? copy.clinicalAi : patientName.toUpperCase()}
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
              <div style={{ fontSize: '0.75rem', fontWeight: '800' }}>{copy.analyzing}</div>
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
              <span style={{ fontSize: '0.8rem', fontWeight: '700', marginLeft: '0.5rem' }}>{listeningStatus.toUpperCase()}</span>
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
              onChange={(e) => {
                setPatientInput(e.target.value);
                if (!isRecording) speechBaseRef.current = e.target.value.trim();
              }}
              placeholder={copy.inputPlaceholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitPatientResponse();
              }}
              style={{ flex: 1, height: '48px' }}
            />
            <button
              onClick={clearPatientInput}
              className="neo-btn btn-white"
              style={{ flexShrink: 0, height: '48px', width: '48px', padding: 0 }}
              disabled={!patientInput.trim() && !isRecording}
              title="Clear captured speech"
            >
              <Trash2 size={18} />
            </button>
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
            {listeningStatus}. {copy.micHelp}
          </p>
        </div>
      ) : (
        <div className="neo-alert alert-success" style={{ marginTop: '1.5rem', border: '3px solid #1E1E1E', flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <CheckCircle size={22} />
            <span style={{ fontWeight: '800', fontSize: '1.1rem' }}>{copy.finished}</span>
          </div>
          
          <div style={{ margin: '1rem 0', fontSize: '0.9rem', border: '2px solid #1E1E1E', padding: '0.75rem', backgroundColor: '#FFF', borderRadius: '4px' }}>
            <div style={{ marginBottom: '0.4rem' }}>
              <strong>{copy.triageCategory}:</strong> <span className={`neo-badge ${getTriageColorClass(triageLevel)}`}>{triageLevel} Priority</span>
            </div>
            <div style={{ marginBottom: '0.4rem' }}>
              <strong>{copy.chiefComplaint}:</strong> {chiefComplaint}
            </div>
            <div>
              <strong>{copy.hpiSnippet}:</strong>
              <div style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.2rem', color: '#333', whiteSpace: 'pre-wrap' }}>
                {hpi}
              </div>
            </div>
          </div>

          <button onClick={handleFinishInterview} className="neo-btn btn-yellow" style={{ width: '100%', padding: '0.85rem' }}>
            {copy.proceedScan} <Sparkles size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

function cleanTranscript(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

async function speakWithGoogleTts(
  text: string,
  languageCode: AppLanguageCode,
  otherLanguageName: string,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
  ,
  speechRequestRef: React.MutableRefObject<number>,
  requestId: number
): Promise<boolean> {
  const chunks = splitForGoogleTts(text);
  if (chunks.length === 0) return false;
  const language = getGoogleTtsLanguage(languageCode, otherLanguageName);

  try {
    for (const chunk of chunks) {
      if (speechRequestRef.current !== requestId) return true;
      const url = `http://localhost:3001/api/tts?lang=${encodeURIComponent(language)}&text=${encodeURIComponent(chunk)}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('Google TTS proxy audio failed'));
      });
    }
    return true;
  } catch (error) {
    if (speechRequestRef.current !== requestId) return true;
    console.warn('Google TTS failed, falling back to browser speech synthesis:', error);
    return false;
  }
}

function splitForGoogleTts(text: string): string[] {
  const normalized = cleanTranscript(text);
  if (!normalized) return [];
  const chunks: string[] = [];
  let current = '';
  for (const word of normalized.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 180) {
      if (current) chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function chooseBestVoice(voices: SpeechSynthesisVoice[], languageCode: AppLanguageCode): SpeechSynthesisVoice | undefined {
  const preferredNames = languageCode === 'hi-IN'
    ? ['Google हिन्दी', 'Microsoft Heera', 'Microsoft Ravi', 'Microsoft Zira', 'Microsoft David']
    : ['Google हिन्दी', 'Google UK English Female', 'Microsoft Zira', 'Microsoft David', 'Microsoft Heera', 'Microsoft Ravi'];
  for (const name of preferredNames) {
    const match = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
    if (match) return match;
  }
  return (
    voices.find(v => v.lang.toLowerCase() === languageCode.toLowerCase()) ||
    voices.find(v => v.lang.toLowerCase().startsWith(languageCode.split('-')[0].toLowerCase())) ||
    voices.find(v => v.lang.toLowerCase() === 'en-in') ||
    voices.find(v => v.lang.toLowerCase().startsWith('en-in')) ||
    voices.find(v => v.lang.toLowerCase().startsWith('en-gb')) ||
    voices.find(v => v.lang.toLowerCase().startsWith('en-us')) ||
    voices[0]
  );
}

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
