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

  return (
    <div className="p-8">
      <p className="text-base">
        Hello, {user.email} — Milestone 2 working.
      </p>
    </div>
  );
}
