"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { onboardingSchema, type OnboardingInput } from "@/lib/schemas/onboarding";

import { checkUsernameAvailable, completeOnboarding } from "./actions";

type Step = "username" | "profile" | "location";

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "ES", name: "Spain" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "CO", name: "Colombia" },
  { code: "CL", name: "Chile" },
];

function prettyUsernameAvailability(
  result:
    | { state: "idle" }
    | { state: "checking" }
    | { state: "available" }
    | { state: "taken"; reason?: string }
    | { state: "invalid"; reason: string }
) {
  switch (result.state) {
    case "idle":
      return null;
    case "checking":
      return <span className="text-xs text-muted-foreground">Checking…</span>;
    case "available":
      return <span className="text-xs text-emerald-600">✅ Available</span>;
    case "taken":
      return (
        <span className="text-xs text-destructive">
          ❌ Not available{result.reason ? `: ${result.reason}` : ""}
        </span>
      );
    case "invalid":
      return (
        <span className="text-xs text-destructive">❌ {result.reason}</span>
      );
  }
}

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("username");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    mode: "onBlur",
    defaultValues: {
      username: "",
      display_name: "",
      bio: null,
      country_code: "ES",
      city_generic: null,
    },
  });

  const username = form.watch("username");
  const bio = form.watch("bio");
  const bioLen = useMemo(() => (bio ? bio.length : 0), [bio]);

  const [usernameStatus, setUsernameStatus] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "available" }
    | { state: "taken"; reason?: string }
    | { state: "invalid"; reason: string }
  >({ state: "idle" });

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setUsernameStatus({ state: "idle" });
    setSubmitError(null);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    const value = (username ?? "").trim();
    if (!value) return;

    debounceRef.current = window.setTimeout(async () => {
      setUsernameStatus({ state: "checking" });
      const res = await checkUsernameAvailable(value);
      if (!res.available) {
        const reason = res.reason ?? "Not available";
        const isInvalid =
          reason.toLowerCase().includes("invalid") ||
          reason.toLowerCase().includes("must");
        setUsernameStatus(
          isInvalid
            ? { state: "invalid", reason }
            : { state: "taken", reason }
        );
        return;
      }
      setUsernameStatus({ state: "available" });
    }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [username]);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function validateAvatar(file: File): string | null {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(file.type)) return "Avatar must be a PNG, JPG, WEBP, or GIF";
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) return "Avatar must be 2MB or smaller";
    return null;
  }

  async function goNext() {
    setSubmitError(null);

    if (step === "username") {
      const ok = await form.trigger(["username"]);
      if (!ok) return;
      const res = await checkUsernameAvailable(form.getValues("username"));
      if (!res.available) {
        setUsernameStatus({ state: "taken", reason: res.reason });
        return;
      }
      setUsernameStatus({ state: "available" });
      setStep("profile");
      return;
    }

    if (step === "profile") {
      const ok = await form.trigger(["display_name", "bio"]);
      if (!ok) return;
      setStep("location");
      return;
    }
  }

  function goBack() {
    setSubmitError(null);
    if (step === "profile") setStep("username");
    else if (step === "location") setStep("profile");
  }

  async function onSubmit(values: OnboardingInput) {
    setSubmitError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("username", values.username);
      fd.set("display_name", values.display_name);
      fd.set("bio", values.bio ?? "");
      fd.set("country_code", values.country_code);
      fd.set("city_generic", values.city_generic ?? "");
      if (avatarFile) fd.set("avatar", avatarFile);

      const res = await completeOnboarding(fd);
      if (!res.ok) {
        setSubmitError(res.error);
        setPending(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const disableTabs = pending;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-6"
        noValidate
      >
        <Tabs value={step} onValueChange={(v) => setStep(v as Step)}>
          <TabsList>
            <TabsTrigger value="username" disabled={disableTabs}>
              1. Username
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              disabled={disableTabs || step === "username"}
            >
              2. Profile
            </TabsTrigger>
            <TabsTrigger
              value="location"
              disabled={disableTabs || step !== "location"}
            >
              3. Location
            </TabsTrigger>
          </TabsList>

          <TabsContent value="username" className="grid gap-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>@username</FormLabel>
                  <FormControl>
                    <div className="grid gap-2">
                      <Input
                        {...field}
                        autoComplete="off"
                        inputMode="text"
                        placeholder="e.g. luna_creator"
                        disabled={pending}
                      />
                      <div className="min-h-4">
                        {prettyUsernameAvailability(usernameStatus)}
                      </div>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Lowercase, 3–30 characters, only letters, numbers, and
                    underscores.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>

          <TabsContent value="profile" className="grid gap-4">
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Your name on Giftly"
                      disabled={pending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <div className="grid gap-2">
                      <Textarea
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value.length ? e.target.value : null)
                        }
                        placeholder="Tell fans what you create (max 280 chars)"
                        disabled={pending}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Optional
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {bioLen}/280
                        </span>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-2">
              <Label htmlFor="avatar">Avatar</Label>
              <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                <div className="h-16 w-16 overflow-hidden rounded-full bg-muted ring-1 ring-foreground/10">
                  {avatarPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarPreviewUrl}
                      alt="Avatar preview"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <Input
                    id="avatar"
                    name="avatar"
                    type="file"
                    accept="image/*"
                    disabled={pending}
                    onChange={(e) => {
                      setSubmitError(null);
                      const file = e.target.files?.[0] ?? null;
                      if (!file) {
                        setAvatarFile(null);
                        return;
                      }
                      const err = validateAvatar(file);
                      if (err) {
                        setAvatarFile(null);
                        setSubmitError(err);
                        return;
                      }
                      setAvatarFile(file);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. PNG/JPG/WEBP/GIF, up to 2MB.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="location" className="grid gap-4">
            <FormField
              control={form.control}
              name="country_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <Select {...field} disabled={pending}>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormDescription>
                    Generic location only (no street address).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city_generic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City (generic)</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value.length ? e.target.value : null)
                      }
                      placeholder="e.g. Barcelona"
                      disabled={pending}
                    />
                  </FormControl>
                  <FormDescription>Optional.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>
        </Tabs>

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={goBack} disabled={pending || step === "username"}>
            Back
          </Button>

          {step !== "location" ? (
            <Button type="button" onClick={goNext} disabled={pending}>
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Finish"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

