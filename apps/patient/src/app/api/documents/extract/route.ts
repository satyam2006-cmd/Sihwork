import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { manageDocument } from "@mcp/tools/index";
import { createServiceClient } from "@/lib/supabase-server";
import { extractDocument, getAnthropicClient } from "@second-opinion/shared";

/**
 * Generate a 2-3 sentence clinical summary of extracted document data.
 */
async function generateDocumentSummary(
  extractedData: Record<string, unknown>,
  fileName: string,
): Promise<string> {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: 'You are a medical document summarizer. Given structured data extracted from a medical document, produce a 2-3 sentence clinical summary. Include the most important findings, values, or diagnoses. Be concise and clinically relevant. Output ONLY the summary.',
      messages: [
        {
          role: 'user',
          content: `Summarize this extracted medical document data (from "${fileName}"):\n\n${JSON.stringify(extractedData, null, 2)}`,
        },
      ],
    });

    const text = response.content.find(c => c.type === 'text');
    return text && text.type === 'text' ? text.text : `Medical document: ${fileName}`;
  } catch {
    // Fallback: generate a basic summary from the data keys
    const keys = Object.keys(extractedData);
    return `Medical document "${fileName}" containing: ${keys.join(', ')}.`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authError] = await requireAuth();
    if (authError) return authError;

    const { documentId } = await request.json();
    if (!documentId) {
      return NextResponse.json({ error: "documentId required" }, { status: 400 });
    }

    // Get document with ownership verification
    const { document: doc } = await manageDocument({
      action: "get",
      document_id: documentId,
      verify_owner_user_id: user.id,
    });

    // Mark as processing
    await manageDocument({
      action: "update_status",
      document_id: documentId,
      status: "processing",
    });

    // Download file from storage (binary operation stays in route)
    const serviceClient = createServiceClient();
    const { data: fileData, error: downloadError } = await serviceClient.storage
      .from("medical-documents")
      .download(doc.file_path as string);

    if (downloadError || !fileData) {
      await manageDocument({
        action: "update_status",
        document_id: documentId,
        status: "failed",
        extraction_error: "Failed to download file",
      });
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Run Claude extraction
    const extractedData = await extractDocument(buffer, doc.mime_type as string);

    // Generate a compact summary for context management
    const extractedSummary = await generateDocumentSummary(
      extractedData as unknown as Record<string, unknown>,
      doc.file_name as string,
    );

    // Update document with extraction results + summary
    await manageDocument({
      action: "update_status",
      document_id: documentId,
      status: "processed",
      extracted_data: extractedData,
      extracted_summary: extractedSummary,
    });

    return NextResponse.json({ extracted_data: extractedData, extracted_summary: extractedSummary });
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
