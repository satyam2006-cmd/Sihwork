"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatInterface } from "@/components/chat/chat-interface";
import { VoiceConsole } from "@/components/voice/voice-console";

interface SessionData {
  id: string;
  status: string;
  mode: string;
  language: string;
  transcript: Array<{ role: string; content: string; timestamp: string }>;
  emergency_flagged: boolean;
  emergency_details: string | null;
  started_at: string;
  ended_at: string | null;
}

interface SummaryData {
  summary_text: string;
  key_findings: string[];
  follow_up_items: string[];
}

interface VisitRecordData {
  chief_complaint: string | null;
  assessment: string | null;
  confidence_score: number | null;
  needs_review: boolean;
}

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [session, setSession] = useState<SessionData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [visitRecord, setVisitRecord] = useState<VisitRecordData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}`);
        const data = await res.json();
        setSession(data.session);
        setSummary(data.summary);
        setVisitRecord(data.visit_record);
      } catch {
        console.error("Failed to load session");
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!session) {
    return <p className="text-gray-500">Session not found</p>;
  }

  // If session is active, show appropriate interface
  if (session.status === "active") {
    if (session.mode === "voice") {
      return (
        <VoiceConsole
          sessionId={sessionId}
          onEnd={() => {
            window.location.reload();
          }}
        />
      );
    }
    return (
      <ChatInterface
        sessionId={sessionId}
        mode={session.mode as "text" | "voice"}
        existingMessages={session.transcript}
      />
    );
  }

  // Completed session view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Session Details</h2>
          <p className="text-gray-500">
            {new Date(session.started_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={session.emergency_flagged ? "destructive" : "secondary"}>
            {session.emergency_flagged ? "Emergency Flagged" : session.status}
          </Badge>
          <Badge variant="outline">{session.mode}</Badge>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Session Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{summary.summary_text}</p>

            {summary.key_findings.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Key Findings</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {summary.key_findings.map((finding, i) => (
                    <li key={i}>{finding}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.follow_up_items.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Follow-up Items</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {summary.follow_up_items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Visit Record */}
      {visitRecord && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Visit Record</CardTitle>
              {visitRecord.confidence_score !== null && (
                <Badge variant={visitRecord.confidence_score >= 0.8 ? "default" : "secondary"}>
                  Confidence: {(visitRecord.confidence_score * 100).toFixed(0)}%
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {visitRecord.chief_complaint && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">Chief Complaint</h4>
                <p className="text-sm">{visitRecord.chief_complaint}</p>
              </div>
            )}
            {visitRecord.assessment && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">Assessment</h4>
                <p className="text-sm">{visitRecord.assessment}</p>
              </div>
            )}
            {visitRecord.needs_review && (
              <Badge variant="secondary">Needs Review</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {session.transcript.map((msg, i) => (
              <div key={i}>
                <div
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
                {i < session.transcript.length - 1 && <Separator className="my-2 opacity-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
