import { NextResponse } from "next/server";
import { getPatient } from "@mcp/tools/index";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { patient, documents, sessions } = await getPatient({
      patient_id: id,
      include_documents: true,
      include_sessions: true,
    });

    return NextResponse.json({
      ...patient,
      allergies: (patient.allergies as string[]) || [],
      chronic_conditions: (patient.chronic_conditions as string[]) || [],
      current_medications: (patient.current_medications as string[]) || [],
      documents: (documents || []).map((d) => ({
        id: d.id,
        file_name: d.file_name,
        status: d.status,
        uploaded_at: d.uploaded_at,
        mime_type: d.mime_type,
      })),
      sessions: sessions || [],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Patient not found") {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    console.error("Patient detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
