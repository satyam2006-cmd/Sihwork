import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@second-opinion/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const supabase = createServiceClient();

    // Fetch document and verify ownership
    const { data: doc } = await supabase
      .from("documents")
      .select("id, patient_id, file_path")
      .eq("id", id)
      .single();

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!patient || doc.patient_id !== patient.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Generate signed URL (valid for 5 minutes)
    const { data, error } = await supabase.storage
      .from("medical-documents")
      .createSignedUrl(doc.file_path, 300);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Document download error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
