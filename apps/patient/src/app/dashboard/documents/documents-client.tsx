"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DocumentRecord {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  status: string;
  extracted_data: Record<string, unknown> | null;
  extracted_summary: string | null;
  extraction_error: string | null;
  uploaded_at: string;
  processed_at: string | null;
}

function statusColor(status: string) {
  switch (status) {
    case "processed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "failed":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

export function DocumentsClient({ initialDocuments }: { initialDocuments: DocumentRecord[] }) {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRecord[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const refreshDocuments = () => {
    router.refresh();
  };

  const handleViewPdf = async (doc: DocumentRecord) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        toast.error("Could not load document");
      }
    } catch {
      toast.error("Could not load document");
    }
  };

  const handleDelete = async (doc: DocumentRecord) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete document");
      } else {
        toast.success("Document deleted");
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        if (selectedDoc?.id === doc.id) setSelectedDoc(null);
      }
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

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
      refreshDocuments();
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
      refreshDocuments();
    } catch {
      toast.error("Extraction failed");
    } finally {
      setExtracting(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
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

  return (
    <div className="space-y-6">
      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{deleteTarget?.file_name}&quot; and its extracted data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div>
        <h2 className="text-2xl font-bold">Medical Documents</h2>
        <p className="text-muted-foreground">Upload and manage your medical records</p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
          dragOver
            ? "border-primary bg-primary/5 shadow-inner"
            : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50"
        }`}
      >
        <div className="flex flex-col items-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="text-lg font-medium mb-1">
            {uploading ? "Uploading..." : "Drop your PDF here"}
          </p>
          <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
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
      </div>

      {/* Document list */}
      <div>
        <Card>
          <div className="divide-y divide-border">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`px-4 py-3 cursor-pointer transition-colors duration-150 ${
                  selectedDoc?.id === doc.id ? "bg-accent" : "hover:bg-accent/60"
                }`}
                onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(doc.file_size / 1024).toFixed(1)} KB &middot;{" "}
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(doc.status)}`}>
                      {doc.status}
                    </span>
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
                    {!doc.file_path.startsWith("demo/") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewPdf(doc);
                        }}
                      >
                        View PDF
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(doc);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {selectedDoc?.id === doc.id && (doc.extracted_data || doc.extracted_summary) && (
                  <div className="mt-4">
                    <Separator className="mb-4" />
                    {doc.extracted_summary && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-foreground/70 mb-1">Clinical Summary</h4>
                        <p className="text-sm text-muted-foreground">{doc.extracted_summary}</p>
                      </div>
                    )}
                    {doc.extracted_data && (
                      <ExtractedDataView data={doc.extracted_data} />
                    )}
                  </div>
                )}

                {selectedDoc?.id === doc.id && doc.extraction_error && (
                  <div className="mt-4">
                    <Separator className="mb-4" />
                    <p className="text-sm text-red-600">Error: {doc.extraction_error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {documents.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No documents uploaded yet. Upload your first medical document above.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ExtractedDataView({ data }: { data: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const docType: string | undefined = d.document_type;
  // Support both formats: seed uses "tests" with "name"/"reference", extraction uses "lab_results" with "test_name"/"reference_range"
  const tests: Array<{ name?: string; test_name?: string; value: string; unit?: string; reference?: string; reference_range?: string; flag?: string }> =
    d.tests || d.lab_results || [];
  const medications: Array<{ name: string; dosage?: string; frequency?: string }> = d.medications || [];
  const diagnoses: Array<{ condition: string; status?: string }> = d.diagnoses || [];
  const rawFindings: string[] = d.raw_findings || [];
  const findings: string | undefined = d.findings;
  const impression: string | undefined = d.impression;

  return (
    <div className="space-y-4">
      {docType && (
        <div>
          <Badge variant="outline">{docType.replace(/_/g, " ")}</Badge>
        </div>
      )}

      {tests.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">Lab Results</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-4">Test</th>
                  <th className="text-left py-1 pr-4">Value</th>
                  <th className="text-left py-1 pr-4">Reference</th>
                  <th className="text-left py-1">Flag</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((result, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1 pr-4">{result.test_name || result.name}</td>
                    <td className="py-1 pr-4 font-mono">{result.value}</td>
                    <td className="py-1 pr-4 text-muted-foreground">{result.reference_range || result.reference || "-"}</td>
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

      {findings && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-1">Findings</h4>
          <p className="text-sm">{findings}</p>
        </div>
      )}

      {impression && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-1">Impression</h4>
          <p className="text-sm">{impression}</p>
        </div>
      )}

      {medications.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">Medications</h4>
          <div className="space-y-1">
            {medications.map((med, i) => (
              <div key={i} className="text-sm flex gap-2">
                <span className="font-medium">{med.name}</span>
                {med.dosage && <span className="text-muted-foreground">{med.dosage}</span>}
                {med.frequency && <span className="text-muted-foreground">({med.frequency})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnoses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">Diagnoses</h4>
          <div className="flex flex-wrap gap-2">
            {diagnoses.map((dx, i) => (
              <Badge key={i} variant="outline">
                {dx.condition}
                {dx.status && ` (${dx.status})`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {rawFindings.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">Key Findings</h4>
          <ul className="list-disc list-inside text-sm space-y-1">
            {rawFindings.map((finding, i) => (
              <li key={i}>{finding}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
