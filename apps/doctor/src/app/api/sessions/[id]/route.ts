import { NextResponse } from "next/server";
import { getSession, reviewVisitRecord } from "@mcp/tools/index";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await getSession({
      session_id: id,
      include_visit_record: true,
      include_summary: true,
      include_patient_name: true,
      include_soap_note: true,
      include_ehr_entry: true,
      include_clinical_letters: true,
    });

    const session = result.session as Record<string, unknown>;

    return NextResponse.json({
      ...session,
      transcript: (session.transcript as unknown[]) || [],
      patient_name: result.patient_name || "Unknown",
      visit_record: result.visit_record || null,
      summary: result.summary || null,
      soap_note: result.soap_note || null,
      ehr_entry: result.ehr_entry || null,
      clinical_letters: result.clinical_letters || [],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Session detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.reviewed) {
      await reviewVisitRecord({ session_id: id });
    }

    // Return updated session detail
    const result = await getSession({
      session_id: id,
      include_visit_record: true,
      include_summary: true,
      include_patient_name: true,
      include_soap_note: true,
      include_ehr_entry: true,
      include_clinical_letters: true,
    });

    const session = result.session as Record<string, unknown>;

    return NextResponse.json({
      ...session,
      transcript: (session.transcript as unknown[]) || [],
      patient_name: result.patient_name || "Unknown",
      visit_record: result.visit_record || null,
      summary: result.summary || null,
      soap_note: result.soap_note || null,
      ehr_entry: result.ehr_entry || null,
      clinical_letters: result.clinical_letters || [],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Session review error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
