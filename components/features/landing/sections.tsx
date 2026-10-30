import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarClockIcon,
  CreditCardIcon,
  DumbbellIcon,
  FlowerIcon,
  HandIcon,
  MusicIcon,
  SearchIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ProviderCard } from "@/components/features/catalog/provider-card";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { catalogHref } from "@/lib/catalog/query";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type ProviderSummary,
} from "@/lib/catalog/types";

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  tutoring: BookOpenIcon,
  fitness: DumbbellIcon,
  yoga: FlowerIcon,
  coaching: SparklesIcon,
  massage: HandIcon,
  music: MusicIcon,
};

const STEPS = [
  {
    icon: SearchIcon,
    title: "Find",
    text: "Filter by category, city, price and online or in-person sessions.",
  },
  {
    icon: CalendarClockIcon,
    title: "Pick a time",
    text: "See real availability in your time zone and choose a free slot.",
  },
  {
    icon: CreditCardIcon,
    title: "Book and pay",
    text: "Pay securely. Free cancellation up to 24 hours before the session.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I found a piano teacher and booked my first lesson in five minutes. No emails, no waiting.",
    name: "Rachel G.",
    role: "Client, Bristol",
  },
  {
    quote: "Clients book themselves into my calendar now. I got back hours every week.",
    name: "Megan H.",
    role: "Sports massage therapist, Leeds",
  },
  {
    quote:
      "Being able to filter by price and online sessions made choosing a tutor so much easier.",
    name: "Omar S.",
    role: "Parent, London",
  },
];

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="text-3xl font-semibold tracking-tight">
        {title}
      </h2>
      {lead && <p className="mt-3 text-lg text-muted-foreground">{lead}</p>}
    </div>
  );
}

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHeading
        id="how-title"
        title="How it works"
        lead="Three steps from search to a confirmed session."
      />
      <ol className="mt-10 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal as="li" key={step.title} index={i} className="rounded-xl border bg-card p-6">
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <step.icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-semibold">
              <span className="text-muted-foreground">{i + 1}. </span>
              {step.title}
            </h3>
            <p className="mt-2 text-muted-foreground">{step.text}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function Categories() {
  return (
    <section aria-labelledby="categories-title" className="border-y bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading id="categories-title" title="Browse by category" />
        <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
          {CATEGORIES.map((category, i) => {
            const Icon = CATEGORY_ICONS[category];
            return (
              <Reveal as="li" key={category} index={i}>
                <Link
                  href={catalogHref({ category })}
                  className="flex min-h-20 items-center gap-3 rounded-xl border bg-card p-4 font-medium transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  {CATEGORY_LABELS[category]}
                </Link>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function FeaturedProviders({ providers }: { providers: ProviderSummary[] }) {
  return (
    <section aria-labelledby="featured-title" className="mx-auto max-w-6xl px-4 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading id="featured-title" title="Top-rated this month" />
        <Button asChild variant="outline">
          <Link href="/pros">
            See all professionals <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {providers.map((provider, i) => (
          <Reveal as="li" key={provider.id} index={i}>
            <ProviderCard provider={provider} />
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export function Testimonials() {
  return (
    <section aria-labelledby="testimonials-title" className="border-y bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading id="testimonials-title" title="What people say" />
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal as="li" key={t.name} index={i}>
              <figure className="flex h-full flex-col rounded-xl border bg-card p-6">
                <blockquote className="flex-1 text-pretty">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-muted-foreground"> — {t.role}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="mx-auto w-full max-w-6xl px-4 pb-20">
      <Reveal className="rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground md:px-12">
        <h2 id="cta-title" className="text-3xl font-semibold tracking-tight">
          Your next session is a few clicks away
        </h2>
        <p className="mx-auto mt-3 max-w-xl opacity-90">
          Browse professionals, compare prices and book a time that suits you.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" variant="secondary" className="h-11 px-5">
            <Link href="/pros">Find a professional</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-11 border-primary-foreground/40 bg-transparent px-5 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link href="/pricing">I am a professional</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
