import { NextResponse } from "next/server";
import { getSession, writeClinicalLetter } from "@mcp/tools/index";
import {
  getAnthropicClient,
  MODELS,
  CLINICAL_LETTER_SYSTEM_PROMPT,
  buildLetterContext,
} from "@second-opinion/shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();

    if (!body.letter_type) {
      return NextResponse.json({ error: "letter_type is required" }, { status: 400 });
    }

    // Fetch session context for the letter
    const sessionData = await getSession({
      session_id: sessionId,
      include_visit_record: true,
      include_summary: true,
      include_soap_note: true,
      include_patient_name: true,
    });

    const patientId = sessionData.session.patient_id as string;

    // Build context for the AI
    const letterContext = buildLetterContext({
      letterType: body.letter_type,
      recipientName: body.recipient_name,
      recipientTitle: body.recipient_title,
      recipientInstitution: body.recipient_institution,
      additionalInstructions: body.additional_instructions,
    });

    const sessionContext = [
      `Patient: ${sessionData.patient_name || "Unknown"}`,
      sessionData.visit_record
        ? `Visit Record:\n- Chief Complaint: ${(sessionData.visit_record as Record<string, unknown>).chief_complaint}\n- Assessment: ${(sessionData.visit_record as Record<string, unknown>).assessment}`
        : null,
      sessionData.summary
        ? `Summary: ${(sessionData.summary as Record<string, unknown>).summary_text}`
        : null,
      sessionData.soap_note
        ? `SOAP Note:\n- S: ${(sessionData.soap_note as Record<string, unknown>).subjective}\n- A: ${(sessionData.soap_note as Record<string, unknown>).assessment}\n- P: ${(sessionData.soap_note as Record<string, unknown>).plan}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    // Generate letter using Claude Opus
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODELS.advanced,
      max_tokens: 4096,
      system: CLINICAL_LETTER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a clinical letter with the following parameters:\n\n${letterContext}\n\n=== SESSION CONTEXT ===\n${sessionContext}`,
        },
      ],
    });

    const letterBody =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Determine subject line
    const typeLabels: Record<string, string> = {
      referral: "Referral",
      clinical_summary: "Clinical Summary",
      follow_up: "Follow-up",
      disability: "Disability Assessment",
      insurance: "Insurance",
      specialist: "Specialist Consultation",
      other: "Clinical Letter",
    };
    const subjectLine =
      body.subject_line ||
      `${typeLabels[body.letter_type] || "Clinical Letter"} — ${sessionData.patient_name || "Patient"}`;

    // Write to DB
    const result = await writeClinicalLetter({
      session_id: sessionId,
      patient_id: patientId,
      letter_type: body.letter_type,
      recipient_name: body.recipient_name,
      recipient_title: body.recipient_title,
      recipient_institution: body.recipient_institution,
      subject_line: subjectLine,
      body: letterBody,
      generated_by: "ai",
    });

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error("Letter generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate clinical letter" },
      { status: 500 }
    );
  }
}
