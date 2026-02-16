"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/utils";
import { useWebSocket } from "@/hooks/use-websocket";
import { useVoice } from "@/hooks/use-voice";
import { PushToTalkButton } from "./push-to-talk-button";
import { AudioVisualizer } from "./audio-visualizer";
import { LanguageSwitcher } from "./language-switcher";
import { EmergencyAlert } from "@/components/chat/emergency-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WSMessage } from "@second-opinion/shared";

type VoiceState =
  | "idle"
  | "connecting"
  | "setting_up"
  | "ready"
  | "listening"
  | "processing"
  | "speaking"
  | "failed";

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

const PROCESSING_TIMEOUT_MS = 45_000;
const SETUP_TIMEOUT_MS = 30_000;

interface VoiceConsoleProps {
  sessionId: string;
  onEnd: () => void;
}

export function VoiceConsole({ sessionId, onEnd }: VoiceConsoleProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [language, setLanguage] = useState("en");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyDetails, setEmergencyDetails] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceStateRef = useRef(voiceState);
  voiceStateRef.current = voiceState;

  const {
    connectionState,
    lastMessage,
    connect,
    disconnect,
    sendAudio,
    sendControl,
  } = useWebSocket(sessionId);

  const { isRecording, audioLevel, startRecording, stopRecording, playAudio } =
    useVoice();

  // Clear processing timeout helper
  const clearProcessingTimeout = useCallback(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  // Start a processing timeout — if server doesn't respond, reset to ready
  const startProcessingTimeout = useCallback(() => {
    clearProcessingTimeout();
    processingTimeoutRef.current = setTimeout(() => {
      if (voiceStateRef.current === "processing") {
        setVoiceState("ready");
      }
    }, PROCESSING_TIMEOUT_MS);
  }, [clearProcessingTimeout]);

  // Clear setup timeout helper
  const clearSetupTimeout = useCallback(() => {
    if (setupTimeoutRef.current) {
      clearTimeout(setupTimeoutRef.current);
      setupTimeoutRef.current = null;
    }
  }, []);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      clearProcessingTimeout();
      clearSetupTimeout();
    };
  }, [clearProcessingTimeout, clearSetupTimeout]);

  // Start connection
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Duration timer
  useEffect(() => {
    if (voiceState === "idle" || voiceState === "connecting" || voiceState === "failed") return;
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [voiceState]);

  // Handle connection state changes
  useEffect(() => {
    if (connectionState === "connecting") {
      setVoiceState("connecting");
    } else if (connectionState === "connected") {
      // WS is open — server should send "setting_up" / "ready" status messages.
      // Start a timeout in case it never does.
      if (voiceStateRef.current === "connecting") {
        setVoiceState("setting_up");
      }
      setupTimeoutRef.current = setTimeout(() => {
        const state = voiceStateRef.current;
        if (state === "connecting" || state === "setting_up") {
          setVoiceState("failed");
        }
      }, SETUP_TIMEOUT_MS);
    } else if (connectionState === "timeout" || connectionState === "error") {
      clearSetupTimeout();
      setVoiceState("failed");
    } else if (connectionState === "disconnected") {
      clearSetupTimeout();
      // If we were still setting up when disconnected, show failed state
      const state = voiceStateRef.current;
      if (state === "connecting" || state === "setting_up") {
        setVoiceState("failed");
      }
    }
  }, [connectionState, clearSetupTimeout]);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage as WSMessage;

    switch (msg.type) {
      case "status": {
        const status = (msg.data as { status: string })?.status;
        if (status === "setting_up") setVoiceState("setting_up");
        else if (status === "ready") {
          clearSetupTimeout();
          clearProcessingTimeout();
          setVoiceState("ready");
        }
        else if (status === "processing") setVoiceState("processing");
        break;
      }
      case "greeting":
        clearSetupTimeout();
        setTranscript((prev) => [
          ...prev,
          { role: "assistant", text: msg.text || "", timestamp: new Date() },
        ]);
        if (msg.audio) {
          setVoiceState("speaking");
          playAudio(msg.audio).then(
            () => { if (voiceStateRef.current === "speaking") setVoiceState("ready"); },
            () => { if (voiceStateRef.current === "speaking") setVoiceState("ready"); }
          );
        }
        break;
      case "transcript":
        if (msg.text) {
          const role = msg.role || "assistant";
          setTranscript((prev) => [
            ...prev,
            { role, text: msg.text!, timestamp: new Date() },
          ]);

          // Play audio for assistant transcripts
          if (msg.audio && role === "assistant") {
            setVoiceState("speaking");
            playAudio(msg.audio).then(
              () => { if (voiceStateRef.current === "speaking") setVoiceState("ready"); },
              () => { if (voiceStateRef.current === "speaking") setVoiceState("ready"); }
            );
          }
        }
        break;
      case "emergency":
        setIsEmergency(true);
        setEmergencyDetails(msg.text || null);
        break;
      case "error": {
        console.error("Voice error:", msg.text);
        const currentState = voiceStateRef.current;
        if (currentState === "connecting" || currentState === "setting_up") {
          // Server sent an error during setup — show failed state
          clearSetupTimeout();
          setVoiceState("failed");
        } else if (currentState === "processing") {
          // Error during message processing — let user retry
          clearProcessingTimeout();
          setVoiceState("ready");
        }
        break;
      }
    }
  }, [lastMessage, playAudio, clearProcessingTimeout, clearSetupTimeout]);

  const handlePTTStart = useCallback(async () => {
    if (voiceState !== "ready") return;
    try {
      await startRecording();
      setVoiceState("listening");
    } catch {
      console.error("Failed to start recording");
    }
  }, [voiceState, startRecording]);

  const handlePTTEnd = useCallback(async () => {
    const audioBuffer = await stopRecording();
    if (audioBuffer && audioBuffer.byteLength > 0) {
      const sent = sendAudio(audioBuffer);
      if (sent) {
        setVoiceState("processing");
        startProcessingTimeout();
      } else {
        // WebSocket disconnected while recording — don't hang in "processing"
        setVoiceState("failed");
      }
    } else {
      setVoiceState("ready");
    }
  }, [stopRecording, sendAudio, startProcessingTimeout]);

  const handleLanguageChange = (lang: string) => {
    if (voiceState === "listening" || voiceState === "processing") return;
    setLanguage(lang);
    sendControl("language", { language: lang });
  };

  const handleEnd = async () => {
    clearProcessingTimeout();
    clearSetupTimeout();
    sendControl("end");
    disconnect();
    // Trigger post-session pipeline (generates visit record + summary).
    // This also marks the session as completed, so the page won't reload
    // into the active voice console again.
    apiFetch(`/api/session/${sessionId}/complete`, { method: "POST" }).catch(() => {});
    onEnd();
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Voice Consultation</h2>
          <Badge variant="outline">{formatDuration(duration)}</Badge>
          <Badge
            variant={voiceState === "ready" ? "default" : "secondary"}
          >
            {voiceState}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher value={language} onChange={handleLanguageChange} />
          <button
            onClick={handleEnd}
            className="px-3 py-1.5 text-sm rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
          >
            End Call
          </button>
        </div>
      </div>

      {isEmergency && <EmergencyAlert details={emergencyDetails} />}

      {/* Transcript */}
      <Card className="flex-1 overflow-hidden mb-4">
        <ScrollArea className="h-full p-4">
          <div className="space-y-3">
            {transcript.map((entry, i) => (
              <div
                key={i}
                className={`flex ${
                  entry.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                    entry.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Voice controls */}
      <Card>
        <CardContent className="p-6 flex flex-col items-center gap-4">
          {voiceState === "failed" ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl">📡</div>
              <p className="font-medium text-foreground">Could not connect to voice server</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                The voice service may not be running. Please ensure the server is started and try again.
              </p>
              <div className="flex gap-2 justify-center pt-2">
                <Button variant="outline" onClick={handleEnd}>
                  End Session
                </Button>
                <Button onClick={() => { setVoiceState("connecting"); connect(); }}>
                  Retry Connection
                </Button>
              </div>
            </div>
          ) : (
            <>
              <AudioVisualizer level={audioLevel} isActive={isRecording} />
              <PushToTalkButton
                onStart={handlePTTStart}
                onEnd={handlePTTEnd}
                isRecording={isRecording}
                disabled={voiceState !== "ready" && voiceState !== "listening"}
              />
              <p className="text-sm text-muted-foreground">
                {voiceState === "ready"
                  ? "Hold to speak"
                  : voiceState === "listening"
                  ? "Listening..."
                  : voiceState === "processing"
                  ? "Processing..."
                  : voiceState === "speaking"
                  ? "Doctor is speaking..."
                  : voiceState === "setting_up"
                  ? "Setting up your call..."
                  : voiceState === "connecting"
                  ? "Connecting..."
                  : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
