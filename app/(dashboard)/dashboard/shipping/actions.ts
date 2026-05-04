"use server";

import { validateAddress } from "@/lib/address/validate";
import type { CreatorShippingStatusDto } from "@/lib/dto/shipping";
import { shippingAddressSchema } from "@/lib/schemas/shipping";
import { createSessionClient } from "@/lib/supabase/server";

export async function getShippingAddressStatus(): Promise<CreatorShippingStatusDto> {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { has_address: false, validated_at: null };
  }

  const { data, error } = await supabase.rpc("get_creator_shipping_status", {
    p_creator_id: user.id,
  });

  if (error) {
    return { has_address: false, validated_at: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return { has_address: false, validated_at: null };
  }

  const r = row as {
    has_address?: boolean;
    address_validated_at?: string | null;
  };

  return {
    has_address: Boolean(r.has_address),
    validated_at: r.address_validated_at ?? null,
  };
}

// PRIVACY-CRITICAL: Cleartext shipping address in transit server-side only — never echo to client.
export async function saveShippingAddress(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSessionClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return { ok: false, error: "Validation failed" };
  }

  const parsed = shippingAddressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }

  const validation = await validateAddress(parsed.data);
  if (!validation.valid) {
    return { ok: false, error: "Validation failed" };
  }

  const n = validation.normalized;

  const { error: setError } = await supabase.rpc("set_creator_shipping_address", {
    p_creator_id: user.id,
    p_legal_name: n.legal_name,
    p_phone: n.phone,
    p_addr_line1: n.address_line1,
    p_addr_line2: n.address_line2,
    p_city: n.address_city,
    p_postal: n.address_postal,
    p_country: n.address_country,
  });

  if (setError) {
    return { ok: false, error: "Validation failed" };
  }

  const { error: validatedError } = await supabase.rpc("set_address_validated", {
    p_creator_id: user.id,
  });

  if (validatedError) {
    return { ok: false, error: "Validation failed" };
  }

  return { ok: true };
}
