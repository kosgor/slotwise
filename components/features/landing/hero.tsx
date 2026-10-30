import { CalendarCheckIcon, SearchIcon } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { CleanGetForm } from "@/components/features/catalog/clean-get-form";
import { ProviderAvatar } from "@/components/features/catalog/provider-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PREVIEW_SLOTS = [
  { time: "09:00", free: true },
  { time: "10:00", free: false },
  { time: "11:30", free: true },
  { time: "14:00", free: true },
  { time: "16:30", free: false },
  { time: "18:00", free: true },
];

export function Hero({ providerCount, cityCount }: { providerCount: number; cityCount: number }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden border-b">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--secondary),transparent_60%)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Badge variant="secondary" className="mb-5">
            {providerCount} vetted professionals in {cityCount} cities
          </Badge>
          <h1
            id="hero-title"
            className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          >
            Book the right professional, at a time that works for you
          </h1>
          <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
            Tutors, trainers, coaches and massage therapists with real-time availability and clear
            prices. No back-and-forth messages.
          </p>
          {/* next/form: a GET form that does client-side navigation, and still works without JS. */}
          <CleanGetForm>
            <Form
              action="/pros"
              className="mt-8 flex max-w-lg flex-col gap-3 sm:flex-row"
              role="search"
            >
              <Label htmlFor="hero-search" className="sr-only">
                What do you need help with?
              </Label>
              <div className="relative flex-1">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="hero-search"
                  name="q"
                  type="search"
                  placeholder="Try “piano”, “yoga” or “Manchester”"
                  className="h-11 pl-9"
                  autoComplete="off"
                />
              </div>
              <Button type="submit" size="lg" className="h-11 px-5">
                Search
              </Button>
            </Form>
          </CleanGetForm>
          <p className="mt-4 text-sm text-muted-foreground">
            Are you a professional?{" "}
            <Link
              href="/pricing"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              List your services for free
            </Link>
          </p>
        </div>

        {/* Decorative product preview: hidden from assistive tech, the real thing lives in /pros. */}
        <div
          aria-hidden="true"
          className="mx-auto w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl"
        >
          <div className="flex items-center gap-3">
            {/* First screen: load eagerly; the h1, not this small image, stays the LCP element. */}
            <ProviderAvatar
              name="Anna Whitfield"
              photoUrl="/images/providers/anna-yoga.jpg"
              preload
            />
            <div>
              <p className="font-semibold">Anna Whitfield</p>
              <p className="text-sm text-muted-foreground">Private yoga class · 60 min</p>
            </div>
          </div>
          <p className="mt-5 text-sm font-medium">Tuesday 3 November</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {PREVIEW_SLOTS.map((slot) => (
              <span
                key={slot.time}
                className={
                  slot.free
                    ? "rounded-lg border border-primary/40 py-2 text-center text-sm font-medium text-primary"
                    : "rounded-lg border py-2 text-center text-sm text-muted-foreground line-through"
                }
              >
                {slot.time}
              </span>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-secondary p-3 text-sm text-secondary-foreground">
            <CalendarCheckIcon className="size-4" />
            Booked for 11:30 — confirmation sent
          </div>
        </div>
      </div>
    </section>
  );
}
