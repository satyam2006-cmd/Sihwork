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

interface Session {
  id: string;
  patient_id: string;
  patient_name: string;
  status: string;
  mode: string;
  emergency_flagged: boolean;
  needs_review: boolean;
  started_at: string;
  ended_at: string | null;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await apiFetch("/api/sessions");
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
        }
      } catch {
        // Sessions will remain empty
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-8">Sessions</h1>
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
      <h1 className="text-3xl font-bold mb-8">Sessions</h1>

      {sessions.length === 0 ? (
        <p className="text-gray-500">No sessions found.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <div className="min-w-[600px] px-4 md:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Emergency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/sessions/${session.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {new Date(session.started_at).toLocaleDateString()}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/patients/${session.patient_id}`}
                        className="hover:underline"
                      >
                        {session.patient_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {session.mode === "scribe" ? (
                        <Badge variant="secondary" className="text-purple-700 bg-purple-100">
                          Clinic Visit
                        </Badge>
                      ) : (
                        <span className="capitalize">{session.mode}</span>
                      )}
                    </TableCell>
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
                      {session.needs_review ? (
                        <Badge variant="secondary" className="text-amber-700 bg-amber-100">
                          Needs Review
                        </Badge>
                      ) : (
                        <span className="text-gray-400">---</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {session.emergency_flagged ? (
                        <Badge variant="destructive">Flagged</Badge>
                      ) : (
                        <span className="text-gray-400">---</span>
                      )}
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
