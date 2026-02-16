"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
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
  ended_at: string | null;
  mode: string;
}

export function SessionsList({ initialSessions }: { initialSessions: Session[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (session: Session) => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/session/${session.id}`, { method: "DELETE" });
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
        <div className="divide-y divide-border">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-accent/60 transition-colors duration-150"
            >
              <Link href={`/dashboard/session/${session.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-lg">{session.mode === "voice" ? "\uD83C\uDFA4" : "\uD83D\uDCAC"}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {session.mode === "voice" ? "Voice" : "Text"} Consultation
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(session.started_at).toLocaleDateString(undefined, {
                      dateStyle: "medium",
                    })}
                    {session.ended_at && (
                      <> &middot; {Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)} min</>
                    )}
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
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteTarget(session)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </Button>
              </div>
            </div>
          ))}
        </div>
        {sessions.length === 0 && (
          <CardContent className="p-8 text-center text-muted-foreground">
            No sessions yet. Start a consultation to get your first second opinion.
          </CardContent>
        )}
      </Card>
    </>
  );
}
