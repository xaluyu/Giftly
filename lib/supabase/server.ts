// PRIVACY-CRITICAL: Never import this file from a 'use client' module. This client bypasses RLS.
import {
  createServerClient as createSupabaseServerClient,
  type SetAllCookies,
} from "@supabase/ssr";
import { cookies } from "next/headers";

function createCookieAdapter() {
  const cookieStore = cookies();

  const setAll: SetAllCookies = (cookiesToSet, responseHeaders) => {
    void responseHeaders;
    try {
      cookiesToSet.forEach(({ name, value, options }) =>
        cookieStore.set(name, value, options)
      );
    } catch {
      // Called from a Server Component; middleware refreshes the session.
    }
  };

  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll,
  };
}

/** Privileged server client (service_role). Bypasses RLS — use only on the server. */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createSupabaseServerClient(url, key, {
    cookies: createCookieAdapter(),
  });
}

/** User-scoped server client (anon key + session JWT). Respects RLS in Server Components and Actions. */
export function createSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createSupabaseServerClient(url, key, {
    cookies: createCookieAdapter(),
  });
}
