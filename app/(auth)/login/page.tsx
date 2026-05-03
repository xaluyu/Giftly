import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const raw = searchParams.error;
  const callbackError =
    typeof raw === "string"
      ? (() => {
          try {
            return decodeURIComponent(raw);
          } catch {
            return raw;
          }
        })()
      : undefined;

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>
            Enter your email and we will send you a magic link.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {callbackError ? (
            <p className="text-sm text-destructive" role="alert">
              {callbackError}
            </p>
          ) : null}
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
