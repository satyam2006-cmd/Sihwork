"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/utils";
import { useVoiceSession, type VoiceSessionState } from "@/hooks/use-voice-session";
import { useVoice } from "@/hooks/use-voice";
import { PushToTalkButton } from "./push-to-talk-button";
import { AudioVisualizer } from "./audio-visualizer";
import { LanguageSwitcher } from "./language-switcher";
import { EmergencyAlert } from "@/components/chat/emergency-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

interface VoiceConsoleProps {
  sessionId: string;
  onEnd: () => void;
}

export function VoiceConsole({ sessionId, onEnd }: VoiceConsoleProps) {
  const [language, setLanguage] = useState("en");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [emergencyDetails, setEmergencyDetails] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const { isRecording, audioLevel, startRecording, stopRecording, playAudio } =
    useVoice();

  const onTranscript = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => [...prev, entry]);
  }, []);

  const onEmergency = useCallback((details: string | null) => {
    setEmergencyDetails(details);
  }, []);

  const { state, isEmergency, initialize, sendAudio, endSession } =
    useVoiceSession({
      sessionId,
      onTranscript,
      onEmergency,
      playAudio,
    });

  // Derive a simpler display state that includes "listening"
  const displayState: VoiceSessionState | "listening" = isRecording
    ? "listening"
    : state;

  // Warm up audio and start — must be called from a user gesture
  // so that iOS Safari allows subsequent Audio.play() calls.
  const handleBegin = useCallback(() => {
    // Play a tiny silent WAV to unlock audio on iOS
    try {
      const silentAudio = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="
      );
      silentAudio.play().then(() => silentAudio.pause()).catch(() => {});
    } catch {}
    initialize();
  }, [initialize]);

  // Duration timer
  useEffect(() => {
    if (state === "idle" || state === "failed") return;
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const handlePTTStart = useCallback(async () => {
    if (state !== "ready") return;
    try {
      await startRecording();
    } catch {
      console.error("Failed to start recording");
    }
  }, [state, startRecording]);

  const handlePTTEnd = useCallback(async () => {
    const result = await stopRecording();
    if (result && result.buffer.byteLength > 0) {
      sendAudio(result.buffer, result.mimeType);
    }
  }, [stopRecording, sendAudio]);

  const handleLanguageChange = (lang: string) => {
    if (state !== "ready") return;
    setLanguage(lang);
  };

  const handleEnd = async () => {
    endSession();
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
            variant={state === "ready" ? "default" : "secondary"}
          >
            {displayState}
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
          {state === "idle" ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl">🎙️</div>
              <p className="font-medium text-foreground">Ready to start your consultation</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Tap the button below to connect with the AI doctor.
              </p>
              <Button size="lg" onClick={handleBegin}>
                Begin Consultation
              </Button>
            </div>
          ) : state === "failed" ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl">📡</div>
              <p className="font-medium text-foreground">Could not start consultation</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Please check your connection and try again.
              </p>
              <div className="flex gap-2 justify-center pt-2">
                <Button variant="outline" onClick={handleEnd}>
                  End Session
                </Button>
                <Button onClick={handleBegin}>
                  Retry
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
                disabled={state !== "ready" && !isRecording}
              />
              <p className="text-sm text-muted-foreground">
                {displayState === "ready"
                  ? "Hold to speak"
                  : displayState === "listening"
                  ? "Listening..."
                  : state === "processing"
                  ? "Processing..."
                  : state === "speaking"
                  ? "Doctor is speaking..."
                  : state === "initializing"
                  ? "Setting up your call..."
                  : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
