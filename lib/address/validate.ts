// PRIVACY-CRITICAL: Cleartext address handling — never log or return to the client.
import { shippingAddressSchema, type ShippingAddressInput } from "@/lib/schemas/shipping";

export type AddressValidateSuccess = {
  valid: true;
  normalized: ShippingAddressInput;
};

export type AddressValidateFailure = {
  valid: false;
  reason: string;
};

export type AddressValidateResult = AddressValidateSuccess | AddressValidateFailure;

/**
 * Server-side address validation. Re-validates shape; stub allows MVP shipping saves.
 * TODO: Replace stub with Google Address Validation API call before production. See https://developers.google.com/maps/documentation/address-validation
 */
export async function validateAddress(
  input: unknown
): Promise<AddressValidateResult> {
  const parsed = shippingAddressSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      reason: parsed.error.issues[0]?.message ?? "Invalid address",
    };
  }

  return { valid: true, normalized: parsed.data };
}
