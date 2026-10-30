import type { Metadata } from "next";
import { Suspense } from "react";

import { NoProviderProfile } from "@/components/features/dashboard/no-provider";
import { ProviderProfileForm } from "@/components/features/provider/provider-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { isAiConfigured } from "@/lib/ai/models";
import { getProviderContext } from "@/lib/provider/context";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const { provider } = await getProviderContext("/dashboard/profile");
  if (!provider) return <NoProviderProfile />;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Public address: <span className="font-mono">{absoluteUrl(`/pros/${provider.slug}`)}</span>
        </p>
      </div>
      <ProviderProfileForm
        aiDraft={isAiConfigured()}
        defaults={{
          displayName: provider.display_name,
          headline: provider.headline,
          bio: provider.bio,
          category: provider.category,
          city: provider.city,
          yearsExperience: provider.years_experience,
          languages: provider.languages.join(", "),
          offersOnline: provider.offers_online,
          offersInPerson: provider.offers_in_person,
        }}
      />
    </div>
  );
}
