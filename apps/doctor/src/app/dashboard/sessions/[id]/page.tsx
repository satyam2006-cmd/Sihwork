"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface TranscriptMessage {
  role: string;
  content: string;
  timestamp?: string;
}

interface VisitRecord {
  id: string;
  chief_complaint: string | null;
  symptoms: string[];
  vitals: Record<string, string | number> | null;
  assessment: string | null;
  recommendations: string[];
  diagnoses: string[];
  follow_up: string | null;
  confidence_score: number | null;
  needs_review: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface SessionSummary {
  id: string;
  summary_text: string;
  key_findings: string[];
  follow_up_items: string[];
}

interface SessionDetail {
  id: string;
  patient_id: string;
  patient_name: string;
  status: string;
  mode: string;
  language: string;
  transcript: TranscriptMessage[];
  emergency_flagged: boolean;
  emergency_details: string | null;
  started_at: string;
  ended_at: string | null;
  visit_record: VisitRecord | null;
  summary: SessionSummary | null;
}

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) {
          setError("Session not found");
          return;
        }
        const data = await res.json();
        setSession(data);
      } catch {
        setError("Failed to load session data");
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [id]);

  const handleMarkReviewed = async () => {
    if (!session) return;
    setMarking(true);
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSession(updated);
        toast.success("Session marked as reviewed");
      } else {
        toast.error("Failed to update session");
      }
    } catch {
      toast.error("Failed to update session");
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-96 bg-gray-100 rounded" />
      </div>
    );
  }

  if (error || !session) {
    return <p className="text-red-600">{error || "Session not found"}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Session Detail</h1>
          <p className="text-gray-500 mt-1">
            Patient:{" "}
            <Link
              href={`/dashboard/patients/${session.patient_id}`}
              className="text-blue-600 hover:underline"
            >
              {session.patient_name}
            </Link>{" "}
            &middot; {new Date(session.started_at).toLocaleString()} &middot;{" "}
            <span className="capitalize">{session.mode}</span> mode
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              session.status === "completed"
                ? "default"
                : session.status === "active"
                ? "secondary"
                : "outline"
            }
          >
            {session.status}
          </Badge>
          {session.emergency_flagged && (
            <Badge variant="destructive">Emergency</Badge>
          )}
        </div>
      </div>

      {session.emergency_flagged && session.emergency_details && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-800 text-sm">
              Emergency Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700 text-sm">{session.emergency_details}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            {session.transcript.length === 0 ? (
              <p className="text-gray-500 text-sm">No transcript available.</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {session.transcript.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg text-sm ${
                      msg.role === "assistant"
                        ? "bg-blue-50 border border-blue-100"
                        : "bg-gray-50 border border-gray-100"
                    }`}
                  >
                    <p className="font-medium text-xs text-gray-500 mb-1 capitalize">
                      {msg.role}
                    </p>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visit Record */}
        <div className="space-y-6">
          {session.visit_record && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Visit Record</CardTitle>
                <div className="flex items-center gap-2">
                  {session.visit_record.confidence_score !== null && (
                    <Badge variant="outline">
                      Confidence:{" "}
                      {Math.round(session.visit_record.confidence_score * 100)}%
                    </Badge>
                  )}
                  {session.visit_record.needs_review &&
                  !session.visit_record.reviewed_at ? (
                    <Button
                      size="sm"
                      onClick={handleMarkReviewed}
                      disabled={marking}
                    >
                      {marking ? "Marking..." : "Mark Reviewed"}
                    </Button>
                  ) : session.visit_record.reviewed_at ? (
                    <Badge variant="default">Reviewed</Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {session.visit_record.chief_complaint && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">
                      Chief Complaint
                    </h4>
                    <p className="mt-1">{session.visit_record.chief_complaint}</p>
                  </div>
                )}

                {session.visit_record.symptoms.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">
                        Symptoms
                      </h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {session.visit_record.symptoms.map((s, i) => (
                          <Badge key={i} variant="secondary">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {session.visit_record.assessment && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">
                        Assessment
                      </h4>
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {session.visit_record.assessment}
                      </p>
                    </div>
                  </>
                )}

                {session.visit_record.diagnoses.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">
                        Diagnoses
                      </h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {session.visit_record.diagnoses.map((d, i) => (
                          <Badge key={i} variant="outline">
                            {d}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {session.visit_record.recommendations.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">
                        Recommendations
                      </h4>
                      <ul className="mt-1 list-disc list-inside text-sm space-y-1">
                        {session.visit_record.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {session.visit_record.follow_up && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">
                        Follow-up
                      </h4>
                      <p className="mt-1 text-sm">
                        {session.visit_record.follow_up}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Session Summary */}
          {session.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Session Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm whitespace-pre-wrap">
                  {session.summary.summary_text}
                </p>

                {session.summary.key_findings.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">
                        Key Findings
                      </h4>
                      <ul className="mt-1 list-disc list-inside text-sm space-y-1">
                        {session.summary.key_findings.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {session.summary.follow_up_items.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">
                        Follow-up Items
                      </h4>
                      <ul className="mt-1 list-disc list-inside text-sm space-y-1">
                        {session.summary.follow_up_items.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
