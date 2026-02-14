import { NextResponse } from "next/server";
import { listSessions } from "@mcp/tools/index";

export async function GET() {
  try {
    const { sessions } = await listSessions({
      include_patient_names: true,
      include_review_status: true,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Sessions list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
