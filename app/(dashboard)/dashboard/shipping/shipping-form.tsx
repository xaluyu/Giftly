"use client";

// Never prefill. The address is never read back to the client.

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  shippingAddressSchema,
  type ShippingAddressInput,
} from "@/lib/schemas/shipping";

import { saveShippingAddress } from "./actions";

type Props = {
  onSaved?: () => void;
};

export function ShippingForm({ onSaved }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ShippingAddressInput>({
    resolver: zodResolver(shippingAddressSchema),
    mode: "onBlur",
    defaultValues: {
      legal_name: "",
      phone: "",
      address_line1: "",
      address_line2: "",
      address_city: "",
      address_postal: "",
      address_country: "",
    },
  });

  async function onSubmit(values: ShippingAddressInput) {
    setSubmitError(null);
    setPending(true);
    try {
      const res = await saveShippingAddress(values);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      onSaved?.();
      router.refresh();
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-4 sm:gap-5"
        noValidate
      >
        <FormField
          control={form.control}
          name="legal_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Legal name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="name"
                  disabled={pending}
                  placeholder="Full name for delivery"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={pending}
                  placeholder="+34 …"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address_line1"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address line 1</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="address-line1"
                  disabled={pending}
                  placeholder="Street, building, apartment"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address_line2"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address line 2 (optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="address-line2"
                  disabled={pending}
                  placeholder="Suite, floor, etc."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="address_city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="address-level2"
                    disabled={pending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address_postal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Postal code</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="postal-code"
                    disabled={pending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address_country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="country"
                  className="uppercase"
                  disabled={pending}
                  maxLength={2}
                  placeholder="ES"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
          {pending ? "Saving…" : "Save shipping address"}
        </Button>
      </form>
    </Form>
  );
}

type PanelProps = {
  hasAddress: boolean;
  validatedAt: string | null;
};

function formatValidatedAt(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return null;
  }
}

export function ShippingAddressPanel({ hasAddress, validatedAt }: PanelProps) {
  const [replaceMode, setReplaceMode] = useState(false);
  const showForm = !hasAddress || replaceMode;
  const prettyDate = formatValidatedAt(validatedAt);

  if (!showForm) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shipping address</CardTitle>
          <CardDescription>
            For your privacy, your full address is only stored encrypted and is
            never shown in the dashboard — not even to you. We use it only for
            fulfilling gifts you receive.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              ✓ Address on file
            </p>
            <p className="mt-1 text-muted-foreground">
              We have your shipping details securely stored. You cannot view or
              edit them here line-by-line — that is intentional so these fields
              never pass through your browser after you save them.
            </p>
            {prettyDate ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Validated on {prettyDate}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setReplaceMode(true)}
          >
            Replace address
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {hasAddress ? "Replace shipping address" : "Add shipping address"}
        </CardTitle>
        <CardDescription>
          Enter your legal name and full delivery address. This information is
          encrypted and never displayed back in this app.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {hasAddress ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start px-0 text-muted-foreground"
            onClick={() => setReplaceMode(false)}
          >
            ← Cancel and keep existing address
          </Button>
        ) : null}
        <ShippingForm
          onSaved={() => {
            setReplaceMode(false);
          }}
        />
      </CardContent>
    </Card>
  );
}
