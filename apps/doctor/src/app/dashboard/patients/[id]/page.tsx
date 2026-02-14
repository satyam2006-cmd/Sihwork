"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PatientDetail {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  blood_type: string | null;
  allergies: string[];
  chronic_conditions: string[];
  current_medications: string[];
  emergency_contact: { name?: string; phone?: string } | null;
  documents: {
    id: string;
    file_name: string;
    status: string;
    uploaded_at: string;
    mime_type: string;
  }[];
  sessions: {
    id: string;
    status: string;
    mode: string;
    emergency_flagged: boolean;
    started_at: string;
    ended_at: string | null;
  }[];
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const res = await fetch(`/api/patients/${id}`);
        if (!res.ok) {
          setError("Patient not found");
          return;
        }
        const data = await res.json();
        setPatient(data);
      } catch {
        setError("Failed to load patient data");
      } finally {
        setLoading(false);
      }
    };
    fetchPatient();
  }, [id]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-100 rounded" />
      </div>
    );
  }

  if (error || !patient) {
    return <p className="text-red-600">{error || "Patient not found"}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{patient.full_name}</h1>
        <p className="text-gray-500 mt-1">Patient Profile</p>
      </div>

      {/* Profile Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Date of Birth</span>
              <span>
                {patient.date_of_birth
                  ? new Date(patient.date_of_birth).toLocaleDateString()
                  : "—"}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-gray-500">Gender</span>
              <span className="capitalize">{patient.gender || "—"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-gray-500">Phone</span>
              <span>{patient.phone || "—"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-gray-500">Blood Type</span>
              <span>{patient.blood_type || "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Medical Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-gray-500 text-sm">Allergies</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {patient.allergies.length > 0
                  ? patient.allergies.map((a, i) => (
                      <Badge key={i} variant="destructive">
                        {a}
                      </Badge>
                    ))
                  : <span className="text-sm text-gray-400">None reported</span>}
              </div>
            </div>
            <Separator />
            <div>
              <span className="text-gray-500 text-sm">Chronic Conditions</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {patient.chronic_conditions.length > 0
                  ? patient.chronic_conditions.map((c, i) => (
                      <Badge key={i} variant="secondary">
                        {c}
                      </Badge>
                    ))
                  : <span className="text-sm text-gray-400">None reported</span>}
              </div>
            </div>
            <Separator />
            <div>
              <span className="text-gray-500 text-sm">
                Current Medications
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {patient.current_medications.length > 0
                  ? patient.current_medications.map((m, i) => (
                      <Badge key={i} variant="outline">
                        {m}
                      </Badge>
                    ))
                  : <span className="text-sm text-gray-400">None reported</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {patient.documents.length === 0 ? (
            <p className="text-gray-500 text-sm">No documents uploaded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      {doc.file_name}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle>Session History</CardTitle>
        </CardHeader>
        <CardContent>
          {patient.sessions.length === 0 ? (
            <p className="text-gray-500 text-sm">No sessions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Emergency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/sessions/${session.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {new Date(session.started_at).toLocaleDateString()}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{session.mode}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          session.status === "completed"
                            ? "default"
                            : session.status === "active"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {session.emergency_flagged ? (
                        <Badge variant="destructive">Yes</Badge>
                      ) : (
                        "No"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
