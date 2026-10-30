import Link from "next/link";

import { Button } from "@/components/ui/button";

export function NoProviderProfile() {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <h1 className="text-2xl font-semibold">This area is for professionals</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        Create a provider profile to list your services, set your hours and receive bookings.
      </p>
      <Button asChild className="mt-6">
        <Link href="/account/become-provider">Become a provider</Link>
      </Button>
    </div>
  );
}
