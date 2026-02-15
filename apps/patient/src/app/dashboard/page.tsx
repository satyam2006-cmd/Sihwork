import { createServerComponentClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed; } catch {}
  }
  return [];
}

export default async function DashboardPage() {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: patient } = await supabase
    .from("patients")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!patient) return null;

  const allergies = parseJsonArray(patient.allergies);
  const medications = parseJsonArray(patient.current_medications);
  const conditions = parseJsonArray(patient.chronic_conditions);

  const [docsRes, sessionsRes, docsCountRes, sessionsCountRes] = await Promise.all([
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
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("patient_id", patient.id),
    supabase
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("patient_id", patient.id),
  ]);

  const documents = docsRes.data || [];
  const sessions = sessionsRes.data || [];
  const totalDocs = docsCountRes.count ?? documents.length;
  const totalSessions = sessionsCountRes.count ?? sessions.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          Welcome, {patient.full_name || "Patient"}
        </h2>
        <p className="text-gray-500">Here&apos;s an overview of your medical records</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Documents</CardDescription>
            <CardTitle className="text-3xl">{totalDocs}</CardTitle>
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
            <CardTitle className="text-3xl">{totalSessions}</CardTitle>
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
              {conditions.length}
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
              <p className="font-medium">{patient.blood_type || "Not set"}</p>
            </div>
            <div>
              <p className="text-gray-500">Allergies</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {allergies.length > 0
                  ? allergies.map((a: string, i: number) => (
                      <Badge key={i} variant="secondary">{a}</Badge>
                    ))
                  : <span className="text-gray-400">None recorded</span>
                }
              </div>
            </div>
            <div>
              <p className="text-gray-500">Medications</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {medications.length > 0
                  ? medications.map((m: string, i: number) => (
                      <Badge key={i} variant="outline">{m}</Badge>
                    ))
                  : <span className="text-gray-400">None recorded</span>
                }
              </div>
            </div>
            <div>
              <p className="text-gray-500">Gender</p>
              <p className="font-medium">{patient.gender || "Not set"}</p>
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
                      <span>{session.mode === "voice" ? "\uD83C\uDFA4" : "\uD83D\uDCAC"}</span>
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
