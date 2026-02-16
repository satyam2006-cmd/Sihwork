import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Authenticate the current request and return the user.
 * Returns [user, null] on success, [null, Response] on failure.
 */
export async function requireAuth(): Promise<
  [{ id: string; email?: string }, null] | [null, NextResponse]
> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return [null, NextResponse.json({ error: "Unauthorized" }, { status: 401 })];
  }
  return [user, null];
}
