import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@mcp/tools/index";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patient_id, doctor_id, language } = body;

    if (!patient_id || !doctor_id) {
      return NextResponse.json(
        { error: "patient_id and doctor_id are required" },
        { status: 400 }
      );
    }

    const { session } = await createSession({
      patient_id,
      mode: "scribe",
      doctor_id,
      language: language || "en",
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Create scribe session error:", error);
    return NextResponse.json(
      { error: "Failed to create scribe session" },
      { status: 500 }
    );
  }
}
