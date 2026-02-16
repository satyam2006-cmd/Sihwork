"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

interface SOAPNote {
  id: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: string;
  edited_at: string | null;
  finalized_at: string | null;
}

const SECTIONS = [
  { key: "subjective" as const, label: "Subjective (S)", description: "Patient-reported" },
  { key: "objective" as const, label: "Objective (O)", description: "Observable findings" },
  { key: "assessment" as const, label: "Assessment (A)", description: "Clinical interpretation" },
  { key: "plan" as const, label: "Plan (P)", description: "Treatment plan" },
];

export function SOAPNoteEditor({
  soapNote,
  sessionId,
  onUpdate,
}: {
  soapNote: SOAPNote;
  sessionId: string;
  onUpdate: (updated: SOAPNote) => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveField = async (field: string) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/soap-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soap_note_id: soapNote.id,
          [field]: editValue,
          status: "edited",
        }),
      });
      if (res.ok) {
        onUpdate({ ...soapNote, [field]: editValue, status: "edited" });
        setEditingField(null);
        toast.success("SOAP note updated");
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/soap-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soap_note_id: soapNote.id,
          status: "finalized",
        }),
      });
      if (res.ok) {
        onUpdate({ ...soapNote, status: "finalized" });
        toast.success("SOAP note finalized");
      } else {
        toast.error("Failed to finalize");
      }
    } catch {
      toast.error("Failed to finalize");
    } finally {
      setFinalizing(false);
    }
  };

  const isFinalized = soapNote.status === "finalized";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>SOAP Note</CardTitle>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              soapNote.status === "finalized"
                ? "default"
                : soapNote.status === "edited"
                ? "secondary"
                : "outline"
            }
          >
            {soapNote.status}
          </Badge>
          {!isFinalized && (
            <Button
              size="sm"
              onClick={handleFinalize}
              disabled={finalizing}
            >
              {finalizing ? "Finalizing..." : "Finalize"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-500">
                {section.label}
              </h4>
              {!isFinalized && editingField !== section.key && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(section.key, soapNote[section.key])}
                >
                  Edit
                </Button>
              )}
            </div>
            {editingField === section.key ? (
              <div className="space-y-2">
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={4}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveField(section.key)}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">
                {soapNote[section.key]}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
