"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
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

interface AuthProviderProps {
  children: React.ReactNode;
  serverUser?: User;
  serverPatient?: Patient;
}

export function AuthProvider({ children, serverUser, serverPatient }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(serverUser ?? null);
  const [patient, setPatient] = useState<Patient | null>(serverPatient ?? null);
  const [loading, setLoading] = useState(false);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const supabase = supabaseRef.current;

    // Only listen for auth changes (sign-in, sign-out, token refresh).
    // Initial state comes from the server — no client-side getSession() needed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          const { data } = await supabase
            .from("patients")
            .select("*")
            .eq("user_id", currentUser.id)
            .single();
          setPatient(data);
        } else {
          setPatient(null);
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabaseRef.current.auth.signOut();
    setUser(null);
    setPatient(null);
  };

  const refreshPatient = async () => {
    if (!user) return;
    const { data } = await supabaseRef.current
      .from("patients")
      .select("*")
      .eq("user_id", user.id)
      .single();
    setPatient(data);
  };

  return (
    <AuthContext.Provider value={{ user, patient, loading, signOut, refreshPatient }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
