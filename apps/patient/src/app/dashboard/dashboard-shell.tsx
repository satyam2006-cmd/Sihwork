"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "🏠" },
  { href: "/dashboard/documents", label: "Documents", icon: "📄" },
  { href: "/dashboard/consultation", label: "Consultation", icon: "💬" },
];

interface DashboardShellProps {
  children: React.ReactNode;
  userEmail: string;
  patientName: string | null;
}

export function DashboardShell({ children, userEmail, patientName }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!patientName) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Patient profile not found</h2>
        <p className="text-gray-500 text-center max-w-md">
          Your account doesn&apos;t have a patient profile. Please sign out and create a new account.
        </p>
        <Button variant="outline" onClick={async () => {
          await createClient().auth.signOut();
          router.push("/login");
        }}>Sign Out</Button>
      </div>
    );
  }

  const initials = patientName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
  };

  const sidebarContent = (
    <>
      <div className="p-6">
        <h1 className="text-lg font-bold">Second Opinion AI</h1>
        <p className="text-sm text-gray-500">Patient Portal</p>
      </div>
      <Separator />
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}>
            <div
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                pathname === item.href
                  ? "bg-gray-200 font-medium"
                  : "hover:bg-gray-100"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </div>
          </Link>
        ))}
      </nav>
      <Separator />
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{patientName}</p>
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={handleSignOut}>
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-gray-50/50 flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col transform transition-transform duration-200 ease-in-out md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 border-b px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 -ml-1 rounded-md hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-semibold text-sm">Second Opinion AI</span>
        </div>
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
