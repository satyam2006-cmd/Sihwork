import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { manageDocument } from "@mcp/tools/index";
import { createServiceClient } from "@/lib/supabase-server";
import { extractDocument } from "@second-opinion/shared";

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

    // Update document with extraction results
    await manageDocument({
      action: "update_status",
      document_id: documentId,
      status: "processed",
      extracted_data: extractedData,
    });

    return NextResponse.json({ extracted_data: extractedData });
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
