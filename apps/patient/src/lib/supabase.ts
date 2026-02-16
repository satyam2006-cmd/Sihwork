import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/";

export function createClient() {
  return createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: basePath,
      },
    }
  );
}

/**
 * Read the Supabase access token directly from the auth cookie.
 * This avoids the navigator.locks deadlock that can occur when
 * supabase.auth.getSession() is called during React StrictMode
 * mount/unmount cycles.
 */
export function getAccessTokenFromCookie(): string | null {
  try {
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!
      .replace('https://', '')
      .split('.')[0];
    const cookieName = `sb-${projectRef}-auth-token`;
    const cookie = document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${cookieName}=`));
    if (!cookie) return null;
    const value = cookie.split('=').slice(1).join('=');
    const decoded = atob(value.replace('base64-', ''));
    const parsed = JSON.parse(decoded);
    return parsed.access_token || null;
  } catch {
    return null;
  }
}
