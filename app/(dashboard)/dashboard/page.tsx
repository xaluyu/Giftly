import Link from "next/link";
import { redirect } from "next/navigation";

import { createSessionClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
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

  return (
    <div className="p-8">
      <p className="text-base">
        Welcome, @{profile.username} — Milestone 2 working.
      </p>
      <p className="mt-4">
        <Link
          href="/dashboard/shipping"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Shipping
        </Link>
      </p>
    </div>
  );
}
