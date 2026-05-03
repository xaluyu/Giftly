"use server";

import { headers } from "next/headers";

import { emailSchema } from "@/lib/schemas/auth";
import { createSessionClient } from "@/lib/supabase/server";

function getRequestOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;

  return "http://localhost:3000";
}

export async function sendMagicLink(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid email";
    return { ok: false, error: msg };
  }

  const supabase = createSessionClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${getRequestOrigin()}/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
