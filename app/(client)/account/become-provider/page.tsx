import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BecomeProviderForm } from "@/components/features/provider/provider-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { getProviderContext, timeZoneOptions } from "@/lib/provider/context";

export const metadata: Metadata = { title: "Become a provider", robots: { index: false } };

export default function BecomeProviderPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Become a provider</h1>
      <p className="mt-2 text-muted-foreground">
        Tell clients who you are. Your profile appears in the catalog after a quick review;
        meanwhile you can add services and working hours.
      </p>
      <div className="mt-8 rounded-2xl border bg-card p-6">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <Application />
        </Suspense>
      </div>
    </div>
  );
}

async function Application() {
  const { provider } = await getProviderContext("/account/become-provider");
  if (provider) redirect("/dashboard");
  return <BecomeProviderForm timeZones={timeZoneOptions()} />;
}
