"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/utils";

interface Patient {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  chronic_conditions: string[];
  session_count: number;
  last_session_at: string | null;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-8">Patients</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Patients</h1>

      {patients.length === 0 ? (
        <p className="text-gray-500">No patients found.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <div className="min-w-[600px] px-4 md:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Conditions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/patients/${patient.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {patient.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">
                      {patient.gender || "---"}
                    </TableCell>
                    <TableCell>
                      {patient.last_session_at
                        ? new Date(patient.last_session_at).toLocaleDateString()
                        : "---"}
                    </TableCell>
                    <TableCell>{patient.session_count}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(patient.chronic_conditions) &&
                        patient.chronic_conditions.length > 0
                          ? patient.chronic_conditions.map((c, i) => (
                              <Badge key={i} variant="secondary">
                                {c}
                              </Badge>
                            ))
                          : "---"}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
