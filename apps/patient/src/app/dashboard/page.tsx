"use client";

import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { patient } = useAuth();
  const [documents, setDocuments] = useState<Array<{ id: string; file_name: string; status: string; uploaded_at: string }>>([]);
  const [sessions, setSessions] = useState<Array<{ id: string; status: string; started_at: string; mode: string }>>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!patient) return;
    const fetchData = async () => {
      const [docsRes, sessionsRes] = await Promise.all([
        supabase
          .from("documents")
          .select("id, file_name, status, uploaded_at")
          .eq("patient_id", patient.id)
          .order("uploaded_at", { ascending: false })
          .limit(5),
        supabase
          .from("sessions")
          .select("id, status, started_at, mode")
          .eq("patient_id", patient.id)
          .order("started_at", { ascending: false })
          .limit(5),
      ]);
      setDocuments(docsRes.data || []);
      setSessions(sessionsRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [patient, supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          Welcome, {patient?.full_name || "Patient"}
        </h2>
        <p className="text-gray-500">Here&apos;s an overview of your medical records</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Documents</CardDescription>
            <CardTitle className="text-3xl">{documents.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/documents">
              <Button variant="link" className="p-0 h-auto text-sm">
                View all documents
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sessions</CardDescription>
            <CardTitle className="text-3xl">{sessions.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/consultation">
              <Button variant="link" className="p-0 h-auto text-sm">
                Start consultation
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conditions</CardDescription>
            <CardTitle className="text-3xl">
              {(patient?.chronic_conditions as string[] || []).length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">Active conditions tracked</p>
          </CardContent>
        </Card>
      </div>

      {/* Patient profile summary */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Blood Type</p>
              <p className="font-medium">{patient?.blood_type || "Not set"}</p>
            </div>
            <div>
              <p className="text-gray-500">Allergies</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(patient?.allergies as string[] || []).length > 0
                  ? (patient?.allergies as string[]).map((a: string, i: number) => (
                      <Badge key={i} variant="secondary">{a}</Badge>
                    ))
                  : <span className="text-gray-400">None recorded</span>
                }
              </div>
            </div>
            <div>
              <p className="text-gray-500">Medications</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(patient?.current_medications as string[] || []).length > 0
                  ? (patient?.current_medications as string[]).map((m: string, i: number) => (
                      <Badge key={i} variant="outline">{m}</Badge>
                    ))
                  : <span className="text-gray-400">None recorded</span>
                }
              </div>
            </div>
            <div>
              <p className="text-gray-500">Gender</p>
              <p className="font-medium">{patient?.gender || "Not set"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sessions.map((session) => (
                <Link key={session.id} href={`/dashboard/session/${session.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-md hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span>{session.mode === "voice" ? "🎤" : "💬"}</span>
                      <div>
                        <p className="text-sm font-medium">
                          {session.mode === "voice" ? "Voice" : "Text"} Consultation
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(session.started_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={session.status === "active" ? "default" : "secondary"}>
                      {session.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
