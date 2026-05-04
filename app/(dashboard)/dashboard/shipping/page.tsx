import Link from "next/link";
import { redirect } from "next/navigation";

import { createSessionClient } from "@/lib/supabase/server";

import { getShippingAddressStatus } from "./actions";
import { ShippingAddressPanel } from "./shipping-form";

export default async function ShippingPage() {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("creator_profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.username) {
    redirect("/onboarding");
  }

  const status = await getShippingAddressStatus();

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Shipping
        </h1>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      <ShippingAddressPanel
        hasAddress={status.has_address}
        validatedAt={status.validated_at}
      />
    </div>
  );
}
