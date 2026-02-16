"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

interface DiagnosisICD {
  code?: string;
  description: string;
  type?: string;
}

interface OrderEntry {
  type: string;
  description: string;
  urgency?: string;
}

interface PrescriptionEntry {
  medication: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
}

interface EHREntry {
  id: string;
  encounter_date: string;
  encounter_type: string;
  chief_complaint: string;
  history_of_present_illness: string;
  past_medical_history: string | null;
  review_of_systems: Record<string, string> | null;
  physical_exam: string | null;
  assessment_and_plan: string;
  diagnoses_icd: DiagnosisICD[];
  procedures_cpt: { code?: string; description: string }[];
  orders: OrderEntry[];
  prescriptions: PrescriptionEntry[];
  follow_up_instructions: string | null;
  status: string;
  edited_at: string | null;
  finalized_at: string | null;
}

export function EHREntryEditor({
  ehrEntry,
  sessionId,
  onUpdate,
}: {
  ehrEntry: EHREntry;
  sessionId: string;
  onUpdate: (updated: EHREntry) => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [rosExpanded, setRosExpanded] = useState(false);

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
      const res = await apiFetch(`/api/sessions/${sessionId}/ehr-entry`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ehr_entry_id: ehrEntry.id,
          [field]: editValue,
          status: "edited",
        }),
      });
      if (res.ok) {
        onUpdate({ ...ehrEntry, [field]: editValue, status: "edited" });
        setEditingField(null);
        toast.success("EHR entry updated");
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
      const res = await apiFetch(`/api/sessions/${sessionId}/ehr-entry`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ehr_entry_id: ehrEntry.id,
          status: "finalized",
        }),
      });
      if (res.ok) {
        onUpdate({ ...ehrEntry, status: "finalized" });
        toast.success("EHR entry finalized");
      } else {
        toast.error("Failed to finalize");
      }
    } catch {
      toast.error("Failed to finalize");
    } finally {
      setFinalizing(false);
    }
  };

  const isFinalized = ehrEntry.status === "finalized";

  const renderEditableText = (
    field: string,
    label: string,
    value: string | null
  ) => {
    if (!value && editingField !== field) return null;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-500">{label}</h4>
          {!isFinalized && editingField !== field && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => startEdit(field, value || "")}
            >
              Edit
            </Button>
          )}
        </div>
        {editingField === field ? (
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
                onClick={() => saveField(field)}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{value}</p>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>EHR Entry</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {ehrEntry.encounter_type.replace(/_/g, " ")}
          </Badge>
          <Badge
            variant={
              ehrEntry.status === "finalized"
                ? "default"
                : ehrEntry.status === "edited"
                ? "secondary"
                : "outline"
            }
          >
            {ehrEntry.status}
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
        {/* Encounter Info */}
        <div className="text-sm text-gray-500">
          Date: {ehrEntry.encounter_date}
        </div>

        {/* Chief Complaint */}
        {renderEditableText(
          "chief_complaint",
          "Chief Complaint",
          ehrEntry.chief_complaint
        )}

        <Separator />

        {/* HPI */}
        {renderEditableText(
          "history_of_present_illness",
          "History of Present Illness",
          ehrEntry.history_of_present_illness
        )}

        {/* PMH */}
        {ehrEntry.past_medical_history && (
          <>
            <Separator />
            {renderEditableText(
              "past_medical_history",
              "Past Medical History",
              ehrEntry.past_medical_history
            )}
          </>
        )}

        {/* ROS */}
        {ehrEntry.review_of_systems &&
          Object.keys(ehrEntry.review_of_systems).length > 0 && (
            <>
              <Separator />
              <div className="space-y-1">
                <button
                  className="flex items-center justify-between w-full text-left"
                  onClick={() => setRosExpanded(!rosExpanded)}
                >
                  <h4 className="text-sm font-medium text-gray-500">
                    Review of Systems
                  </h4>
                  <span className="text-xs text-gray-400">
                    {rosExpanded ? "Collapse" : "Expand"}
                  </span>
                </button>
                {rosExpanded && (
                  <div className="space-y-1 pl-2">
                    {Object.entries(ehrEntry.review_of_systems).map(
                      ([system, findings]) => (
                        <div key={system} className="text-sm">
                          <span className="font-medium capitalize">
                            {system}:
                          </span>{" "}
                          {findings}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </>
          )}

        {/* Physical Exam */}
        {ehrEntry.physical_exam && (
          <>
            <Separator />
            {renderEditableText(
              "physical_exam",
              "Physical Exam",
              ehrEntry.physical_exam
            )}
          </>
        )}

        <Separator />

        {/* Assessment & Plan */}
        {renderEditableText(
          "assessment_and_plan",
          "Assessment & Plan",
          ehrEntry.assessment_and_plan
        )}

        {/* Diagnoses */}
        {Array.isArray(ehrEntry.diagnoses_icd) && ehrEntry.diagnoses_icd.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-gray-500">Diagnoses</h4>
              <div className="flex flex-wrap gap-1 mt-1">
                {ehrEntry.diagnoses_icd.map((d, i) => (
                  <Badge key={i} variant="outline">
                    {d.code ? `${d.code}: ` : ""}
                    {d.description}
                    {d.type ? ` (${d.type})` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Orders */}
        {Array.isArray(ehrEntry.orders) && ehrEntry.orders.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-gray-500">Orders</h4>
              <ul className="mt-1 list-disc list-inside text-sm space-y-1">
                {ehrEntry.orders.map((o, i) => (
                  <li key={i}>
                    <span className="capitalize">{o.type}</span>:{" "}
                    {o.description}
                    {o.urgency ? ` (${o.urgency})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Prescriptions */}
        {Array.isArray(ehrEntry.prescriptions) && ehrEntry.prescriptions.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-gray-500">
                Prescriptions
              </h4>
              <ul className="mt-1 list-disc list-inside text-sm space-y-1">
                {ehrEntry.prescriptions.map((p, i) => (
                  <li key={i}>
                    {p.medication}
                    {p.dosage ? ` ${p.dosage}` : ""}
                    {p.frequency ? `, ${p.frequency}` : ""}
                    {p.duration ? ` for ${p.duration}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Follow-up */}
        {ehrEntry.follow_up_instructions && (
          <>
            <Separator />
            {renderEditableText(
              "follow_up_instructions",
              "Follow-up Instructions",
              ehrEntry.follow_up_instructions
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
