import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSession } from "@mcp/tools/index";
import { getAnthropicClient, SESSION_SUMMARY_SYSTEM_PROMPT } from "@second-opinion/shared";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const { session } = await getSession({
      session_id: sessionId,
      verify_owner_user_id: user.id,
    });

    const transcript = (session.transcript as Array<{ role: string; content: string }>) || [];
    const transcriptText = transcript
      .map((m) => `${m.role === "user" ? "Patient" : "Doctor"}: ${m.content}`)
      .join("\n");

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      system: SESSION_SUMMARY_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Generate a clinical summary:\n\n${transcriptText}` },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ error: "No summary generated" }, { status: 500 });
    }

    let jsonStr = textContent.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const summaryData = JSON.parse(jsonStr);

    return NextResponse.json(summaryData);
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    console.error("Summary error:", error);
    return NextResponse.json({ error: "Summary generation failed" }, { status: 500 });
  }
}
