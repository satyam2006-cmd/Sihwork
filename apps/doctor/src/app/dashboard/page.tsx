"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/utils";

interface DashboardStats {
  totalPatients: number;
  totalSessions: number;
  needsReview: number;
  emergencyFlagged: number;
}

export default function DashboardPage() {
  const { doctor } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    totalSessions: 0,
    needsReview: 0,
    emergencyFlagged: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [patientsRes, sessionsRes] = await Promise.all([
          apiFetch("/api/patients"),
          apiFetch("/api/sessions"),
        ]);

        const patients = patientsRes.ok ? await patientsRes.json() : [];
        const sessions = sessionsRes.ok ? await sessionsRes.json() : [];

        setStats({
          totalPatients: patients.length,
          totalSessions: sessions.length,
          needsReview: sessions.filter(
            (s: { needs_review?: boolean }) => s.needs_review
          ).length,
          emergencyFlagged: sessions.filter(
            (s: { emergency_flagged?: boolean }) => s.emergency_flagged
          ).length,
        });
      } catch {
        // Stats will remain at defaults
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Welcome back{doctor?.full_name ? `, Dr. ${doctor.full_name.split(" ").pop()}` : ""}
        </h1>
        <p className="text-gray-500 mt-1">
          Here is an overview of your practice.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Total Patients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalPatients}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Total Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalSessions}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Needs Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600">
                {stats.needsReview}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Emergency Flagged
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">
                {stats.emergencyFlagged}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
