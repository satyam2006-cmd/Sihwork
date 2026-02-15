import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@second-opinion/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const supabase = createServiceClient();

    // Verify ownership
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("id, patient_id, file_path")
      .eq("id", id)
      .single();

    if (fetchError || !doc) {
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

    // Delete from storage if path exists
    if (doc.file_path) {
      await supabase.storage.from("medical-documents").remove([doc.file_path]);
    }

    // Delete DB record
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Document delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
