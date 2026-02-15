import { createServerComponentClient } from "@/lib/supabase-server";
import { DocumentsClient } from "./documents-client";

export default async function DocumentsPage() {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!patient) return null;

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("patient_id", patient.id)
    .order("uploaded_at", { ascending: false });

  return <DocumentsClient initialDocuments={documents || []} />;
}
