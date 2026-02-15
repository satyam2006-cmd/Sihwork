import { createServerComponentClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: patient } = await supabase
    .from("patients")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return (
    <DashboardShell
      userEmail={user.email || ""}
      patientName={patient?.full_name || null}
    >
      {children}
    </DashboardShell>
  );
}
