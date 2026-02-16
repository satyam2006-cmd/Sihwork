import { createBrowserClient } from "@supabase/ssr";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: basePath,
      },
    }
  );
}
