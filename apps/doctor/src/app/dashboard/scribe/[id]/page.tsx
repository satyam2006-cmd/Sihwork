"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useScribeWebSocket } from "@/hooks/use-scribe-websocket";
import { useScribeRecording } from "@/hooks/use-scribe-recording";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/utils";

interface TranscriptChunk {
  text: string;
  timestamp: string;
  language?: string;
}

export default function ScribeSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const router = useRouter();
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [duration, setDuration] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connectionState, lastMessage, connect, disconnect, sendAudio, sendControl } =
    useScribeWebSocket(sessionId);

  const onAudioChunk = useCallback(
    (buffer: ArrayBuffer, mimeType: string) => {
      sendAudio(buffer, mimeType);
    },
    [sendAudio]
  );

  const { isRecording, audioLevel, startContinuousRecording, stopContinuousRecording } =
    useScribeRecording({ onAudioChunk });

  // Connect WebSocket on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "transcript" && lastMessage.text) {
      setTranscript((prev) => [
        ...prev,
        {
          text: lastMessage.text!,
          timestamp: new Date().toISOString(),
          language: lastMessage.language,
        },
      ]);
    }
  }, [lastMessage]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Duration timer
  useEffect(() => {
    if (isRecording && !durationRef.current) {
      durationRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }
    if (!isRecording && durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
    return () => {
      if (durationRef.current) clearInterval(durationRef.current);
    };
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = async () => {
    try {
      await startContinuousRecording();
      setHasStarted(true);
    } catch {
      // Permission denied or error
    }
  };

  const handleEndVisit = async () => {
    setIsEnding(true);

    // Stop recording
    stopContinuousRecording();

    // Tell server session is ending
    sendControl("end");

    // Run post-session pipeline
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/complete`, {
        method: "POST",
      });

      if (res.ok) {
        router.push(`/dashboard/sessions/${sessionId}`);
      } else {
        // Still navigate — session is saved even if pipeline had issues
        router.push(`/dashboard/sessions/${sessionId}`);
      }
    } catch {
      router.push(`/dashboard/sessions/${sessionId}`);
    }
  };

  const isReady = connectionState === "connected";
  const isFailed = connectionState === "timeout" || connectionState === "error";

  const handleRetry = () => {
    disconnect();
    // Small delay to let the old connection fully close
    setTimeout(() => connect(), 300);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Clinic Visit Scribe</h1>
          <p className="text-muted-foreground text-sm">Session {sessionId.slice(0, 8)}...</p>
        </div>
        <div className="flex items-center gap-2">
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse">
              Recording {formatDuration(duration)}
            </Badge>
          )}
          <Badge
            variant={
              connectionState === "connected"
                ? "default"
                : connectionState === "connecting"
                ? "secondary"
                : isFailed
                ? "destructive"
                : "outline"
            }
          >
            {connectionState}
          </Badge>
        </div>
      </div>

      {/* Audio Level */}
      {isRecording && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-100"
            style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
          />
        </div>
      )}

      {/* Transcript */}
      <Card className="flex-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">
            Live Transcript
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-y-auto space-y-2">
            {transcript.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                {isFailed
                  ? "Could not connect to the voice server."
                  : hasStarted
                  ? "Listening... transcript will appear here"
                  : "Start recording to begin transcription"}
              </p>
            ) : (
              transcript.map((chunk, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm"
                >
                  <p className="text-xs text-gray-400 mb-1">
                    {new Date(chunk.timestamp).toLocaleTimeString()}
                  </p>
                  <p className="whitespace-pre-wrap">{chunk.text}</p>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <div className="flex gap-3">
        {isFailed ? (
          <>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push("/dashboard/scribe")}
            >
              Back
            </Button>
            <Button className="flex-1" onClick={handleRetry}>
              Retry Connection
            </Button>
          </>
        ) : !hasStarted ? (
          <Button
            className="flex-1"
            disabled={!isReady}
            onClick={handleStartRecording}
          >
            {isReady ? "Start Recording" : "Connecting..."}
          </Button>
        ) : !isRecording ? (
          <>
            <Button
              className="flex-1"
              onClick={handleStartRecording}
            >
              Resume Recording
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={isEnding}
              onClick={handleEndVisit}
            >
              {isEnding ? "Processing..." : "End Visit"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={stopContinuousRecording}
            >
              Pause
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={isEnding}
              onClick={handleEndVisit}
            >
              {isEnding ? "Processing..." : "End Visit"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
