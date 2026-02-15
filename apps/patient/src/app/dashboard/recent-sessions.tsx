"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Session {
  id: string;
  status: string;
  started_at: string;
  mode: string;
}

export function RecentSessions({ initialSessions }: { initialSessions: Session[] }) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (session: Session) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/session/${session.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete session");
      } else {
        toast.success("Session deleted");
        setSessions((prev) => prev.filter((s) => s.id !== session.id));
      }
    } catch {
      toast.error("Failed to delete session");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (sessions.length === 0) return null;

  return (
    <>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
            <DialogDescription>
              This will permanently delete this {deleteTarget?.mode} consultation
              from {deleteTarget ? new Date(deleteTarget.started_at).toLocaleDateString() : ""} and
              all related records. This action cannot be undone.
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>Recent Sessions</CardTitle>
          <Link href="/dashboard/sessions">
            <Button variant="link" className="p-0 h-auto text-sm">
              See all sessions &rarr;
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors duration-150">
                <Link href={`/dashboard/session/${session.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <span>{session.mode === "voice" ? "\uD83C\uDFA4" : "\uD83D\uDCAC"}</span>
                  <div>
                    <p className="text-sm font-medium">
                      {session.mode === "voice" ? "Voice" : "Text"} Consultation
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.started_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <Badge variant={session.status === "active" ? "default" : "secondary"}>
                    {session.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                    onClick={() => setDeleteTarget(session)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
