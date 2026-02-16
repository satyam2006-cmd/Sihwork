"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);
  const initialized = useRef(false);

  const fetchDoctor = useCallback(
    async (userId: string) => {
      try {
        const { data } = await supabase
          .from("doctors")
          .select("*")
          .eq("user_id", userId)
          .single();
        setDoctor(data);
      } catch {
        setDoctor(null);
      }
    },
    [supabase]
  );

  useEffect(() => {
    // Use onAuthStateChange as the sole source of truth.
    // getSession() can hang due to internal locks in Supabase SSR,
    // especially under React StrictMode double-mounting.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchDoctor(session.user.id);
      } else {
        setDoctor(null);
      }
      // Mark as loaded after the first auth state event
      if (!initialized.current) {
        initialized.current = true;
        setLoading(false);
      }
    });

    // Fallback: if onAuthStateChange doesn't fire within 3s, unblock the UI
    const timeout = setTimeout(() => {
      if (!initialized.current) {
        initialized.current = true;
        setLoading(false);
      }
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase, fetchDoctor]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setDoctor(null);
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, doctor, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
