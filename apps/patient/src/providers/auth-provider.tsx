"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import type { Patient } from "@second-opinion/shared";

interface AuthContextType {
  user: User | null;
  patient: Patient | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshPatient: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  patient: null,
  loading: true,
  signOut: async () => {},
  refreshPatient: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchPatient = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("patients")
      .select("*")
      .eq("user_id", userId)
      .single();
    setPatient(data);
  }, [supabase]);

  const refreshPatient = useCallback(async () => {
    if (user) {
      await fetchPatient(user.id);
    }
  }, [user, fetchPatient]);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchPatient(session.user.id);
      }
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchPatient(session.user.id);
        } else {
          setPatient(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchPatient]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPatient(null);
  };

  return (
    <AuthContext.Provider value={{ user, patient, loading, signOut, refreshPatient }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
