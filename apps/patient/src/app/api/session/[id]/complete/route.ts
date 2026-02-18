import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession, updateSession } from "@mcp/tools/index";
import { runPostSessionAgent } from "@mcp/post-session-agent";
import { hydrateEHRContext, serializeEHRContext } from "@second-opinion/shared";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    // Get session with ownership verification
    const { session } = await getSession({
      session_id: sessionId,
      verify_owner_user_id: user.id,
    });

    const transcript = (session.transcript as Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }>) || [];
    if (transcript.length < 2) {
      // Still mark as completed even if transcript is too short
      await updateSession({ session_id: sessionId, complete: true });
      return NextResponse.json({ success: true, skipped: true });
    }

    const patientId = session.patient_id as string;

    // 1. Mark session completed
    await updateSession({
      session_id: sessionId,
      complete: true,
    });

    // 2. Hydrate EHR context for temporal awareness
    let serializedEHR: string | undefined;
    try {
      const ehrContext = await hydrateEHRContext(patientId);
      serializedEHR = serializeEHRContext(ehrContext);
    } catch (err) {
      console.error("Failed to hydrate EHR context for post-session:", err);
    }

    // 3. Run the agentic post-session pipeline
    const result = await runPostSessionAgent(sessionId, patientId, transcript, serializedEHR);

    if (result.errors.length > 0) {
      console.error("Post-session agent errors:", result.errors);
    }

    return NextResponse.json({
      success: true,
      visit_record_id: result.visit_record_id,
      summary_id: result.summary_id,
      soap_note_id: result.soap_note_id,
      ehr_entry_id: result.ehr_entry_id,
      clinical_letter_ids: result.clinical_letter_ids,
      patient_updated: result.patient_updated,
      errors: result.errors,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Post-session pipeline error:", error);
    return NextResponse.json(
      { error: "Pipeline processing failed" },
      { status: 500 }
    );
  }
}
