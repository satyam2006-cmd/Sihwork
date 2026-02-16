"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ActiveSession {
  id: string;
  mode: string;
  started_at: string;
}

export default function ConsultationPage() {
  const [starting, setStarting] = useState(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchActiveSessions = async () => {
      try {
        const res = await apiFetch("/api/session");
        const data = await res.json();
        const active = (data.sessions || []).filter(
          (s: { status: string }) => s.status === "active"
        );
        setActiveSessions(active);
      } catch {
        // Ignore - non-critical
      }
    };
    fetchActiveSessions();
  }, []);

  const startSession = async (mode: "text" | "voice") => {
    setStarting(true);
    try {
      const res = await apiFetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to start session");
        return;
      }

      router.push(`/dashboard/session/${data.session.id}`);
    } catch {
      toast.error("Failed to start session");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Start Consultation</h2>
        <p className="text-muted-foreground">
          Get a second opinion from our AI doctor
        </p>
      </div>

      {/* Active session warning */}
      {activeSessions.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <h3 className="font-medium text-foreground mb-2">You have an active session</h3>
            <div className="space-y-2">
              {activeSessions.map((session) => (
                <Link key={session.id} href={`/dashboard/session/${session.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-card hover:bg-accent transition-colors duration-150">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span>{session.mode === "voice" ? "\uD83C\uDFA4" : "\uD83D\uDCAC"}</span>
                      <span className="text-sm font-medium">
                        {session.mode === "voice" ? "Voice" : "Text"} Consultation
                      </span>
                      <span className="text-xs text-muted-foreground">
                        started {new Date(session.started_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                    <Badge>Resume</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-t-4 border-t-blue-500 hover:shadow-md transition-all duration-200">
          <CardHeader>
            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-2">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <CardTitle>Text Consultation</CardTitle>
            <CardDescription>
              Chat with the AI doctor via text. Your medical history and documents
              will be reviewed automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => startSession("text")}
              disabled={starting}
            >
              {starting ? "Starting..." : "Start Text Chat"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-emerald-500 hover:shadow-md transition-all duration-200">
          <CardHeader>
            <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-2">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <CardTitle>Voice Consultation</CardTitle>
            <CardDescription>
              Speak with the AI doctor. Supports English and Hindi.
              Uses push-to-talk for clear communication.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => startSession("voice")}
              disabled={starting}
            >
              {starting ? "Starting..." : "Start Voice Call"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-l-4 border-l-amber-400 bg-amber-50/50">
        <CardContent className="p-6">
          <div className="flex gap-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 mt-0.5 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              <h3 className="font-medium mb-2 text-amber-900">Before you begin</h3>
              <ul className="text-sm text-amber-800/80 space-y-1 list-disc list-inside">
                <li>Upload any recent medical documents for a more informed consultation</li>
                <li>The AI doctor will review your medical history automatically</li>
                <li>This is a second opinion tool — always consult your primary physician</li>
                <li>In case of emergency, call your local emergency number immediately</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
