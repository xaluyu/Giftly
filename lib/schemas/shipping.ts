import { z } from "zod";

const internationalPhoneRegex = /^[+]?[0-9 \-]{6,20}$/;

export const shippingAddressSchema = z.object({
  legal_name: z
    .string()
    .trim()
    .min(1, "Legal name is required")
    .max(100, "Legal name must be at most 100 characters"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .regex(
      internationalPhoneRegex,
      "Enter a valid international phone number"
    ),
  address_line1: z
    .string()
    .trim()
    .min(1, "Address line 1 is required")
    .max(120, "Address line 1 must be at most 120 characters"),
  address_line2: z
    .string()
    .trim()
    .max(120, "Address line 2 must be at most 120 characters"),
  address_city: z
    .string()
    .trim()
    .min(1, "City is required")
    .max(80, "City must be at most 80 characters"),
  address_postal: z
    .string()
    .trim()
    .min(1, "Postal code is required")
    .max(20, "Postal code must be at most 20 characters"),
  address_country: z
    .string()
    .trim()
    .length(2, "Country must be a 2-letter ISO code")
    .regex(/^[A-Za-z]{2}$/, "Country must be ISO 3166-1 alpha-2")
    .transform((v) => v.toUpperCase()),
});

export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;
