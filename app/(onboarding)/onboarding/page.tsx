import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createSessionClient } from "@/lib/supabase/server";

import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/login");
  }

  const { data: existingProfile } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Creator onboarding</CardTitle>
          <CardDescription>
            Choose your unique @username and set up your public profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
      </Card>
    </div>
  );
}

