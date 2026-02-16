import { NextResponse } from "next/server";
import { writeClinicalLetter, updateClinicalLetter } from "@mcp/tools/index";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();

    if (!body.patient_id || !body.letter_type || !body.subject_line || !body.body) {
      return NextResponse.json(
        { error: "patient_id, letter_type, subject_line, and body are required" },
        { status: 400 }
      );
    }

    const result = await writeClinicalLetter({
      session_id: sessionId,
      patient_id: body.patient_id,
      letter_type: body.letter_type,
      recipient_name: body.recipient_name,
      recipient_title: body.recipient_title,
      recipient_institution: body.recipient_institution,
      subject_line: body.subject_line,
      body: body.body,
      generated_by: 'doctor',
    });

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error("Clinical letter create error:", error);
    return NextResponse.json({ error: "Failed to create clinical letter" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const body = await request.json();

    if (!body.letter_id) {
      return NextResponse.json({ error: "letter_id is required" }, { status: 400 });
    }

    await updateClinicalLetter(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clinical letter update error:", error);
    return NextResponse.json({ error: "Failed to update clinical letter" }, { status: 500 });
  }
}
