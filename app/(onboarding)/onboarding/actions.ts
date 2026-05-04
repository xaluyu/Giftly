"use server";

import { createSessionClient } from "@/lib/supabase/server";

import { onboardingSchema, usernameSchema } from "@/lib/schemas/onboarding";

export async function checkUsernameAvailable(
  username: string
): Promise<{ available: boolean; reason?: string }> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return {
      available: false,
      reason: parsed.error.issues[0]?.message ?? "Invalid username",
    };
  }

  const supabase = createSessionClient();
  const { count, error } = await supabase
    .from("creator_profiles")
    .select("id", { count: "exact", head: true })
    .eq("username", parsed.data);

  if (error) {
    return { available: false, reason: "Unable to check availability" };
  }

  return { available: (count ?? 0) === 0 };
}

function getExtFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName !== file.name) return fromName.toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[file.type] ?? "bin";
}

function parseNullableTextFromFormData(v: FormDataEntryValue | null) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export async function completeOnboarding(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSessionClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return { ok: false, error: "You must be logged in" };
  }

  const payload = {
    username: typeof formData.get("username") === "string" ? String(formData.get("username")) : "",
    display_name:
      typeof formData.get("display_name") === "string"
        ? String(formData.get("display_name"))
        : "",
    bio: parseNullableTextFromFormData(formData.get("bio")),
    country_code:
      typeof formData.get("country_code") === "string"
        ? String(formData.get("country_code"))
        : "",
    city_generic: parseNullableTextFromFormData(formData.get("city_generic")),
  };

  const parsed = onboardingSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid onboarding data",
    };
  }

  let avatarUrl: string | null = null;
  const avatar = formData.get("avatar");
  if (avatar instanceof File && avatar.size > 0) {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(avatar.type)) {
      return { ok: false, error: "Avatar must be a PNG, JPG, WEBP, or GIF" };
    }
    const maxBytes = 2 * 1024 * 1024;
    if (avatar.size > maxBytes) {
      return { ok: false, error: "Avatar must be 2MB or smaller" };
    }

    const ext = getExtFromFile(avatar);
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, avatar, {
        contentType: avatar.type,
        upsert: false,
      });

    if (uploadError) {
      return { ok: false, error: uploadError.message };
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    avatarUrl = data.publicUrl ?? null;
  }

  const { error: insertError } = await supabase.from("creator_profiles").insert({
    id: user.id,
    username: parsed.data.username,
    display_name: parsed.data.display_name,
    bio: parsed.data.bio,
    avatar_url: avatarUrl,
    country_code: parsed.data.country_code,
    city_generic: parsed.data.city_generic,
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true };
}

