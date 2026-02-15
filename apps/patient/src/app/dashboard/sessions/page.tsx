import { createServerComponentClient } from "@/lib/supabase-server";
import { SessionsList } from "./sessions-list";

export default async function SessionsPage() {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!patient) return null;

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, status, started_at, ended_at, mode")
    .eq("patient_id", patient.id)
    .order("started_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">All Sessions</h2>
        <p className="text-muted-foreground">View and manage your consultation history</p>
      </div>
      <SessionsList initialSessions={sessions || []} />
    </div>
  );
}
