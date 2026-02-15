import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/providers/auth-provider";
import { Toaster } from "@/components/ui/sonner";
import { createServerComponentClient } from "@/lib/supabase-server";
import type { Patient } from "@second-opinion/shared";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Second Opinion AI - Patient Portal",
  description: "AI-powered medical second opinion platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();

  let patient: Patient | null = null;
  if (user) {
    const { data } = await supabase
      .from("patients")
      .select("*")
      .eq("user_id", user.id)
      .single();
    patient = data;
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider serverUser={user ?? undefined} serverPatient={patient ?? undefined}>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
