import { NextResponse } from "next/server";
import { updateEHREntry } from "@mcp/tools/index";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // session id available but update uses ehr_entry_id directly
    const body = await request.json();

    if (!body.ehr_entry_id) {
      return NextResponse.json({ error: "ehr_entry_id is required" }, { status: 400 });
    }

    await updateEHREntry(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("EHR entry update error:", error);
    return NextResponse.json({ error: "Failed to update EHR entry" }, { status: 500 });
  }
}
