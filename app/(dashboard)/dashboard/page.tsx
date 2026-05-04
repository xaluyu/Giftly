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
    </div>
  );
}
