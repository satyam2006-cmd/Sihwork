import { NextResponse } from "next/server";
import { updateSOAPNote } from "@mcp/tools/index";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // session id available but update uses soap_note_id directly
    const body = await request.json();

    if (!body.soap_note_id) {
      return NextResponse.json({ error: "soap_note_id is required" }, { status: 400 });
    }

    await updateSOAPNote(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SOAP note update error:", error);
    return NextResponse.json({ error: "Failed to update SOAP note" }, { status: 500 });
  }
}
