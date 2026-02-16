"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { GenerateLetterDialog } from "./generate-letter-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

interface ClinicalLetter {
  id: string;
  letter_type: string;
  recipient_name: string | null;
  recipient_title: string | null;
  recipient_institution: string | null;
  subject_line: string;
  body: string;
  generated_by: string;
  status: string;
  created_at: string;
  edited_at: string | null;
  finalized_at: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  referral: "Referral",
  clinical_summary: "Clinical Summary",
  follow_up: "Follow-up",
  disability: "Disability",
  insurance: "Insurance",
  specialist: "Specialist",
  other: "Other",
};

export function ClinicalLettersPanel({
  letters: initialLetters,
  sessionId,
  onRefresh,
}: {
  letters: ClinicalLetter[];
  sessionId: string;
  onRefresh: () => void;
}) {
  const [letters, setLetters] = useState(Array.isArray(initialLetters) ? initialLetters : []);
  // Sync internal state when parent re-fetches session data (e.g. after letter generation)
  useEffect(() => {
    setLetters(Array.isArray(initialLetters) ? initialLetters : []);
  }, [initialLetters]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const startEdit = (letter: ClinicalLetter) => {
    setEditingId(letter.id);
    setEditBody(letter.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
  };

  const saveBody = async (letterId: string) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/letters`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter_id: letterId,
          body: editBody,
          status: "edited",
        }),
      });
      if (res.ok) {
        setLetters((prev) =>
          prev.map((l) =>
            l.id === letterId ? { ...l, body: editBody, status: "edited" } : l
          )
        );
        setEditingId(null);
        toast.success("Letter updated");
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const finalizeLetter = async (letterId: string) => {
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/letters`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter_id: letterId,
          status: "finalized",
        }),
      });
      if (res.ok) {
        setLetters((prev) =>
          prev.map((l) =>
            l.id === letterId ? { ...l, status: "finalized" } : l
          )
        );
        toast.success("Letter finalized");
      } else {
        toast.error("Failed to finalize");
      }
    } catch {
      toast.error("Failed to finalize");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Clinical Letters</CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          Generate New Letter
        </Button>
      </CardHeader>
      <CardContent>
        {letters.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No clinical letters generated yet.
          </p>
        ) : (
          <div className="space-y-3">
            {letters.map((letter) => (
              <div
                key={letter.id}
                className="border rounded-lg p-3 space-y-2"
              >
                {/* Letter header */}
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-2 text-left"
                    onClick={() =>
                      setExpandedId(
                        expandedId === letter.id ? null : letter.id
                      )
                    }
                  >
                    <Badge variant="secondary">
                      {TYPE_LABELS[letter.letter_type] || letter.letter_type}
                    </Badge>
                    <span className="text-sm font-medium truncate max-w-[300px]">
                      {letter.subject_line}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        letter.status === "finalized"
                          ? "default"
                          : letter.status === "edited"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {letter.status}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {new Date(letter.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Expanded content */}
                {expandedId === letter.id && (
                  <div className="space-y-2 pt-2">
                    {letter.recipient_name && (
                      <p className="text-xs text-gray-500">
                        To: {letter.recipient_name}
                        {letter.recipient_title
                          ? `, ${letter.recipient_title}`
                          : ""}
                        {letter.recipient_institution
                          ? ` — ${letter.recipient_institution}`
                          : ""}
                      </p>
                    )}
                    <Separator />
                    {editingId === letter.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={12}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveBody(letter.id)}
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
                      <div className="space-y-2">
                        <p className="text-sm whitespace-pre-wrap">
                          {letter.body}
                        </p>
                        {letter.status !== "finalized" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(letter)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => finalizeLetter(letter.id)}
                            >
                              Finalize
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <GenerateLetterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sessionId={sessionId}
        onGenerated={onRefresh}
      />
    </Card>
  );
}
