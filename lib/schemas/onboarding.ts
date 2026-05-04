import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    /^[a-z0-9][a-z0-9_]*$/,
    "Username must use lowercase letters, numbers, or underscores"
  )
  .refine((v) => !v.startsWith("_"), "Username cannot start with '_'");

const nullableTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .transform((v) => (v.length ? v : null))
    .nullable();

export const onboardingSchema = z.object({
  username: usernameSchema,
  display_name: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(60, "Display name must be at most 60 characters"),
  bio: nullableTrimmedText(280),
  country_code: z
    .string()
    .trim()
    .length(2, "Country must be a 2-letter code")
    .regex(/^[A-Za-z]{2}$/, "Country must be a 2-letter ISO code")
    .transform((v) => v.toUpperCase()),
  city_generic: nullableTrimmedText(80),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

