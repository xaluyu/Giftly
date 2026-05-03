import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4">
      <div className="space-y-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Giftly
        </h1>
        <p className="text-lg text-muted-foreground">
          Send gifts without ever asking for an address
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "default", size: "lg" }))}
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" })
          )}
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
