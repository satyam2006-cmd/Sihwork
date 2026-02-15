import { createServerComponentClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecentSessions } from "./recent-sessions";

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed; } catch {}
  }
  return [];
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function HeartPulseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 12.572l-7.5 7.428l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572" />
      <path d="M12 6L12 12" />
      <path d="M9 9h6" />
    </svg>
  );
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
        <p className="text-muted-foreground">Here&apos;s an overview of your medical records</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-t-4 border-t-blue-500 hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="font-medium">Documents</CardDescription>
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <FileIcon className="text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-3xl">{totalDocs}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/documents">
              <Button variant="link" className="p-0 h-auto text-sm text-blue-600 hover:text-blue-800">
                View all documents &rarr;
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500 hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="font-medium">Sessions</CardDescription>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <MessageIcon className="text-emerald-600" />
              </div>
            </div>
            <CardTitle className="text-3xl">{totalSessions}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/consultation">
              <Button variant="link" className="p-0 h-auto text-sm text-emerald-600 hover:text-emerald-800">
                Start consultation &rarr;
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-violet-500 hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="font-medium">Conditions</CardDescription>
              <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
                <HeartPulseIcon className="text-violet-600" />
              </div>
            </div>
            <CardTitle className="text-3xl">
              {conditions.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conditions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {conditions.map((c: string, i: number) => (
                  <Badge key={i} variant="secondary" className="bg-violet-50 text-violet-700 border-violet-200">
                    {c}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No conditions recorded</p>
            )}
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
              <p className="text-muted-foreground">Blood Type</p>
              <p className="font-medium">{patient.blood_type || "Not set"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Allergies</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {allergies.length > 0
                  ? allergies.map((a: string, i: number) => (
                      <Badge key={i} variant="secondary">{a}</Badge>
                    ))
                  : <span className="text-muted-foreground/60">None recorded</span>
                }
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Medications</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {medications.length > 0
                  ? medications.map((m: string, i: number) => (
                      <Badge key={i} variant="outline">{m}</Badge>
                    ))
                  : <span className="text-muted-foreground/60">None recorded</span>
                }
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Gender</p>
              <p className="font-medium">{patient.gender || "Not set"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent sessions */}
      <RecentSessions initialSessions={sessions} />
    </div>
  );
}
