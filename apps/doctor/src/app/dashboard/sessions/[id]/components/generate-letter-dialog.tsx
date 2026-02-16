"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const LETTER_TYPES = [
  { value: "referral", label: "Referral" },
  { value: "clinical_summary", label: "Clinical Summary" },
  { value: "follow_up", label: "Follow-up" },
  { value: "disability", label: "Disability" },
  { value: "insurance", label: "Insurance" },
  { value: "specialist", label: "Specialist" },
  { value: "other", label: "Other" },
];

export function GenerateLetterDialog({
  open,
  onOpenChange,
  sessionId,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onGenerated: () => void;
}) {
  const [letterType, setLetterType] = useState("referral");
  const [recipientName, setRecipientName] = useState("");
  const [recipientTitle, setRecipientTitle] = useState("");
  const [recipientInstitution, setRecipientInstitution] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/letters/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            letter_type: letterType,
            recipient_name: recipientName || undefined,
            recipient_title: recipientTitle || undefined,
            recipient_institution: recipientInstitution || undefined,
            additional_instructions: additionalInstructions || undefined,
          }),
        }
      );
      if (res.ok) {
        toast.success("Letter generated");
        onOpenChange(false);
        onGenerated();
        // Reset form
        setLetterType("referral");
        setRecipientName("");
        setRecipientTitle("");
        setRecipientInstitution("");
        setAdditionalInstructions("");
      } else {
        toast.error("Failed to generate letter");
      }
    } catch {
      toast.error("Failed to generate letter");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Clinical Letter</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Letter Type</Label>
            <select
              value={letterType}
              onChange={(e) => setLetterType(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {LETTER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Recipient Name (optional)</Label>
            <Input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Dr. Jane Smith"
            />
          </div>
          <div className="space-y-2">
            <Label>Recipient Title (optional)</Label>
            <Input
              value={recipientTitle}
              onChange={(e) => setRecipientTitle(e.target.value)}
              placeholder="Cardiologist"
            />
          </div>
          <div className="space-y-2">
            <Label>Recipient Institution (optional)</Label>
            <Input
              value={recipientInstitution}
              onChange={(e) => setRecipientInstitution(e.target.value)}
              placeholder="City General Hospital"
            />
          </div>
          <div className="space-y-2">
            <Label>Additional Instructions (optional)</Label>
            <Textarea
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="Include specific details about..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
