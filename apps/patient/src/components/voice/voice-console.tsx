"use client";

import { useEffect, useState, useCallback } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useVoice } from "@/hooks/use-voice";
import { PushToTalkButton } from "./push-to-talk-button";
import { AudioVisualizer } from "./audio-visualizer";
import { LanguageSwitcher } from "./language-switcher";
import { EmergencyAlert } from "@/components/chat/emergency-alert";
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
  | "speaking";

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
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [language, setLanguage] = useState("en");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyDetails, setEmergencyDetails] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

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

  // Start connection
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Duration timer
  useEffect(() => {
    if (voiceState === "idle" || voiceState === "connecting") return;
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [voiceState]);

  // Handle connection state changes
  useEffect(() => {
    if (connectionState === "connecting") {
      setVoiceState("connecting");
    } else if (connectionState === "error") {
      setVoiceState("idle");
    }
  }, [connectionState]);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage as WSMessage;

    switch (msg.type) {
      case "status": {
        const status = (msg.data as { status: string })?.status;
        if (status === "setting_up") setVoiceState("setting_up");
        else if (status === "ready") setVoiceState("ready");
        else if (status === "processing") setVoiceState("processing");
        break;
      }
      case "greeting":
        setTranscript((prev) => [
          ...prev,
          { role: "assistant", text: msg.text || "", timestamp: new Date() },
        ]);
        if (msg.audio) {
          setVoiceState("speaking");
          playAudio(msg.audio).finally(() => setVoiceState("ready"));
        }
        break;
      case "transcript":
        if (msg.text) {
          // Determine if this is user or assistant based on context
          const isUserTranscript =
            transcript.length === 0 ||
            transcript[transcript.length - 1]?.role === "assistant";
          const role = isUserTranscript ? "user" : "assistant";

          setTranscript((prev) => [
            ...prev,
            { role, text: msg.text!, timestamp: new Date() },
          ]);

          if (msg.audio && role === "assistant") {
            setVoiceState("speaking");
            playAudio(msg.audio).finally(() => setVoiceState("ready"));
          }
        }
        break;
      case "emergency":
        setIsEmergency(true);
        setEmergencyDetails(msg.text || null);
        break;
      case "error":
        console.error("Voice error:", msg.text);
        break;
    }
  }, [lastMessage, playAudio, transcript]);

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
      setVoiceState("processing");
      sendAudio(audioBuffer);
    } else {
      setVoiceState("ready");
    }
  }, [stopRecording, sendAudio]);

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    sendControl("language", { language: lang });
  };

  const handleEnd = () => {
    sendControl("end");
    disconnect();
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
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100"
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
          <AudioVisualizer level={audioLevel} isActive={isRecording} />
          <PushToTalkButton
            onStart={handlePTTStart}
            onEnd={handlePTTEnd}
            isRecording={isRecording}
            disabled={voiceState !== "ready" && voiceState !== "listening"}
          />
          <p className="text-sm text-gray-500">
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
        </CardContent>
      </Card>
    </div>
  );
}
