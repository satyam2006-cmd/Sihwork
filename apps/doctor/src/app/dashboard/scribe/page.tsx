"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/utils";

interface Patient {
  id: string;
  full_name: string;
}

export default function ScribePage() {
  const router = useRouter();
  const { doctor } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await apiFetch("/api/patients");
        if (res.ok) {
          const data = await res.json();
          setPatients(data);
        }
      } catch {
        // Patients will remain empty
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleStart = async () => {
    if (!selectedPatient || !doctor?.id) return;

    setCreating(true);
    try {
      const res = await apiFetch("/api/sessions/scribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          doctor_id: doctor.id,
        }),
      });

      if (res.ok) {
        const { session } = await res.json();
        router.push(`/dashboard/scribe/${session.id}`);
      }
    } catch {
      // Error handled by empty catch
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Clinic Scribe</h1>
      <p className="text-gray-500 mb-8">
        Start a real-time scribe session during an in-person clinic visit.
        The conversation will be transcribed and clinical documentation generated automatically.
      </p>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>New Scribe Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select Patient</Label>
            <Input
              placeholder="Search patients..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedPatient(null);
              }}
            />
            {search && !selectedPatient && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {loading ? (
                  <div className="p-3 text-sm text-gray-500">Loading...</div>
                ) : filteredPatients.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">No patients found</div>
                ) : (
                  filteredPatients.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b last:border-b-0"
                      onClick={() => {
                        setSelectedPatient(p);
                        setSearch(p.full_name);
                      }}
                    >
                      {p.full_name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedPatient && (
            <div className="p-3 bg-gray-50 rounded-md text-sm">
              Selected: <span className="font-medium">{selectedPatient.full_name}</span>
            </div>
          )}

          <Button
            className="w-full"
            disabled={!selectedPatient || creating}
            onClick={handleStart}
          >
            {creating ? "Creating session..." : "Start Scribe Session"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
