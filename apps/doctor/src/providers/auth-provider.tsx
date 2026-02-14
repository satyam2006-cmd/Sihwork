"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface Doctor {
  id: string;
  user_id: string;
  full_name: string;
  specialization: string | null;
}

interface AuthContextType {
  user: User | null;
  doctor: Doctor | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  doctor: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchDoctor = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("doctors")
        .select("*")
        .eq("user_id", userId)
        .single();
      setDoctor(data);
    },
    [supabase]
  );

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) await fetchDoctor(session.user.id);
      setLoading(false);
    };
    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchDoctor(session.user.id);
      } else {
        setDoctor(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchDoctor]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setDoctor(null);
  };

  return (
    <AuthContext.Provider value={{ user, doctor, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
