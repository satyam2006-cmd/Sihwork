"use client";

import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface DocumentRecord {
  id: string;
  file_name: string;
  file_size: number;
  status: string;
  extracted_data: Record<string, unknown> | null;
  extraction_error: string | null;
  uploaded_at: string;
  processed_at: string | null;
}

export default function DocumentsPage() {
  const { patient } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const supabase = createClient();

  const fetchDocuments = useCallback(async () => {
    if (!patient) return;
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("patient_id", patient.id)
      .order("uploaded_at", { ascending: false });
    setDocuments(data || []);
    setLoading(false);
  }, [patient, supabase]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }

      toast.success("Document uploaded successfully");
      await fetchDocuments();

      // Auto-extract
      handleExtract(data.document.id);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleExtract = async (documentId: string) => {
    setExtracting(documentId);
    try {
      const res = await fetch("/api/documents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Extraction failed");
      } else {
        toast.success("Document extracted successfully");
      }
      await fetchDocuments();
    } catch {
      toast.error("Extraction failed");
    } finally {
      setExtracting(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = document.createElement("input");
      input.type = "file";
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handleUpload({ target: input } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Medical Documents</h2>
        <p className="text-gray-500">Upload and manage your medical records</p>
      </div>

      {/* Upload zone */}
      <Card>
        <CardContent className="p-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
          >
            <div className="text-4xl mb-3">📄</div>
            <p className="text-lg font-medium mb-1">
              {uploading ? "Uploading..." : "Drop your PDF here"}
            </p>
            <p className="text-sm text-gray-500 mb-4">or click to browse</p>
            <label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
              <Button variant="outline" disabled={uploading} asChild>
                <span>Select PDF</span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Document list */}
      <div className="space-y-4">
        {documents.map((doc) => (
          <Card
            key={doc.id}
            className={`cursor-pointer transition-colors ${
              selectedDoc?.id === doc.id ? "ring-2 ring-blue-500" : "hover:bg-gray-50"
            }`}
            onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className="font-medium">{doc.file_name}</p>
                    <p className="text-sm text-gray-500">
                      {(doc.file_size / 1024).toFixed(1)} KB &middot;{" "}
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      doc.status === "processed"
                        ? "default"
                        : doc.status === "failed"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {doc.status}
                  </Badge>
                  {doc.status === "uploaded" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={extracting === doc.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExtract(doc.id);
                      }}
                    >
                      {extracting === doc.id ? "Extracting..." : "Extract"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded view with extracted data */}
              {selectedDoc?.id === doc.id && doc.extracted_data && (
                <div className="mt-4">
                  <Separator className="mb-4" />
                  <ExtractedDataView data={doc.extracted_data} />
                </div>
              )}

              {selectedDoc?.id === doc.id && doc.extraction_error && (
                <div className="mt-4">
                  <Separator className="mb-4" />
                  <p className="text-sm text-red-600">Error: {doc.extraction_error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {documents.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No documents uploaded yet. Upload your first medical document above.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ExtractedDataView({ data }: { data: Record<string, unknown> }) {
  const extraction = data as {
    document_type?: string;
    summary?: string;
    lab_results?: Array<{ test_name: string; value: string; unit?: string; reference_range?: string; flag?: string }>;
    medications?: Array<{ name: string; dosage?: string; frequency?: string }>;
    diagnoses?: Array<{ condition: string; status?: string }>;
    raw_findings?: string[];
  };

  return (
    <div className="space-y-4">
      {extraction.document_type && (
        <div>
          <Badge variant="outline">{extraction.document_type.replace(/_/g, " ")}</Badge>
        </div>
      )}

      {extraction.summary && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1">Summary</h4>
          <p className="text-sm">{extraction.summary}</p>
        </div>
      )}

      {extraction.lab_results && extraction.lab_results.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Lab Results</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-4">Test</th>
                  <th className="text-left py-1 pr-4">Value</th>
                  <th className="text-left py-1 pr-4">Unit</th>
                  <th className="text-left py-1 pr-4">Reference</th>
                  <th className="text-left py-1">Flag</th>
                </tr>
              </thead>
              <tbody>
                {extraction.lab_results.map((result, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1 pr-4">{result.test_name}</td>
                    <td className="py-1 pr-4 font-mono">{result.value}</td>
                    <td className="py-1 pr-4">{result.unit || "-"}</td>
                    <td className="py-1 pr-4">{result.reference_range || "-"}</td>
                    <td className="py-1">
                      {result.flag && (
                        <Badge
                          variant={
                            result.flag === "critical"
                              ? "destructive"
                              : result.flag === "high" || result.flag === "low"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {result.flag}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {extraction.medications && extraction.medications.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Medications</h4>
          <div className="space-y-1">
            {extraction.medications.map((med, i) => (
              <div key={i} className="text-sm flex gap-2">
                <span className="font-medium">{med.name}</span>
                {med.dosage && <span className="text-gray-500">{med.dosage}</span>}
                {med.frequency && <span className="text-gray-500">({med.frequency})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {extraction.diagnoses && extraction.diagnoses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Diagnoses</h4>
          <div className="flex flex-wrap gap-2">
            {extraction.diagnoses.map((dx, i) => (
              <Badge key={i} variant="outline">
                {dx.condition}
                {dx.status && ` (${dx.status})`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {extraction.raw_findings && extraction.raw_findings.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Key Findings</h4>
          <ul className="list-disc list-inside text-sm space-y-1">
            {extraction.raw_findings.map((finding, i) => (
              <li key={i}>{finding}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
