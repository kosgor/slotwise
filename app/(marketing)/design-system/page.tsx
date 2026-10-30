import { CheckIcon, Loader2Icon, PlusIcon, TrashIcon } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";

import { ProviderCard } from "@/components/features/catalog/provider-card";
import { ToastDemo } from "@/components/features/design-system/toast-demo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFeaturedProviders } from "@/lib/catalog/repository";
import { getContrastReport } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

// Developer showcase, not a page for clients: not linked from the site, not in the sitemap,
// not indexed. Reachable by direct URL (linked from the README for portfolio reviewers).
export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
  description:
    "Slotwise design tokens and UI components with all states, contrast ratios and accessibility notes.",
};

const COLOR_TOKENS = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["muted", "muted-foreground"],
  ["accent", "accent-foreground"],
  ["success", "success-foreground"],
  ["warning", "warning-foreground"],
  ["destructive", "background"],
] as const;

// Tailwind needs complete class names in the source to generate them.
const SWATCH: Record<(typeof COLOR_TOKENS)[number][0], string> = {
  background: "bg-background text-foreground",
  card: "bg-card text-card-foreground",
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  muted: "bg-muted text-muted-foreground",
  accent: "bg-accent text-accent-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  destructive: "bg-destructive text-background",
};

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;
const BADGE_VARIANTS = ["default", "secondary", "outline", "destructive"] as const;

function Section({
  id,
  title,
  children,
  note,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t py-12 first:border-t-0">
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {note && <p className="mt-2 max-w-3xl text-muted-foreground">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default async function DesignSystemPage() {
  "use cache";
  cacheLife("days");
  const [contrast, [sampleProvider]] = await Promise.all([
    getContrastReport(),
    getFeaturedProviders(1),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Design system</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
        Tokens and components used across Slotwise. Components are shadcn/ui on Radix primitives,
        styled only with tokens from <code className="font-mono text-sm">app/globals.css</code>.
        Toggle the theme in the header to see dark mode.
      </p>

      <Section
        id="colors"
        title="Color tokens"
        note="Each surface is shown with its paired text color. Contrast is computed from the CSS at build time — the same check runs as a unit test."
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {COLOR_TOKENS.map(([bg, fg]) => (
            <li key={bg} className={cn("rounded-xl border p-4", SWATCH[bg])}>
              <p className="font-semibold">{bg}</p>
              <p className="font-mono text-xs">text: {fg}</p>
            </li>
          ))}
        </ul>
        {/* Scrollable on narrow screens: focusable so keyboard users can scroll it with arrow keys. */}
        <div
          className="relative mt-8 overflow-x-auto rounded-xl border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          tabIndex={0}
          role="region"
          aria-label="Contrast ratios table"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">
              WCAG contrast ratios of token pairs in light and dark themes
            </caption>
            <thead className="bg-muted/60 text-left">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  Usage
                </th>
                <th scope="col" className="p-3 font-medium">
                  Pair
                </th>
                <th scope="col" className="p-3 font-medium">
                  Required
                </th>
                <th scope="col" className="p-3 font-medium">
                  Light
                </th>
                <th scope="col" className="p-3 font-medium">
                  Dark
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contrast.map((row) => (
                <tr key={`${row.fg}-${row.bg}`}>
                  <th scope="row" className="p-3 text-left font-normal">
                    {row.usage}
                  </th>
                  <td className="p-3 font-mono text-xs">
                    {row.fg} / {row.bg}
                  </td>
                  <td className="p-3">{row.min}:1</td>
                  {[row.light, row.dark].map((value, i) => (
                    <td key={i} className="p-3">
                      <span className="inline-flex items-center gap-1">
                        {value.toFixed(2)}:1
                        {value >= row.min && (
                          <CheckIcon className="size-4 text-success" aria-label="passes" />
                        )}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="typography"
        title="Typography"
        note="Geist via next/font: self-hosted, no layout shift. Headings use text-balance, paragraphs text-pretty."
      >
        <div className="space-y-4">
          <p className="text-4xl font-semibold tracking-tight">Heading 1 · 36px</p>
          <p className="text-3xl font-semibold tracking-tight">Heading 2 · 30px</p>
          <p className="text-xl font-semibold">Heading 3 · 20px</p>
          <p className="text-lg text-muted-foreground">Lead paragraph · 18px</p>
          <p>Body text · 16px. The quick brown fox jumps over the lazy dog.</p>
          <p className="text-sm text-muted-foreground">Small / secondary · 14px</p>
          <p className="font-mono text-sm">Monospace · Geist Mono</p>
        </div>
      </Section>

      <Section
        id="buttons"
        title="Buttons"
        note="Focus ring appears only for keyboard focus (focus-visible). Press Tab to see it."
      >
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Add">
              <PlusIcon aria-hidden="true" />
            </Button>
            <Button>
              <PlusIcon aria-hidden="true" />
              With icon
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Disabled</Button>
            {/* Loading: disabled to prevent double submit, aria-busy for assistive tech. */}
            <Button disabled aria-busy="true">
              <Loader2Icon className="animate-spin" aria-hidden="true" />
              Saving…
            </Button>
            <Button variant="destructive">
              <TrashIcon aria-hidden="true" />
              Cancel booking
            </Button>
          </div>
        </div>
      </Section>

      <Section
        id="forms"
        title="Form fields"
        note="Every field has a visible label. Errors are linked with aria-describedby and marked with aria-invalid. Inputs are 16px on mobile so iOS Safari does not zoom in."
      >
        <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ds-name">Full name</Label>
            <Input id="ds-name" placeholder="Anna Whitfield" autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-disabled">Disabled</Label>
            <Input id="ds-disabled" disabled value="Not editable" readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-email">Email</Label>
            <Input
              id="ds-email"
              type="email"
              defaultValue="anna@"
              aria-invalid="true"
              aria-describedby="ds-email-error"
            />
            <p id="ds-email-error" className="text-sm text-destructive">
              Enter a valid email address, for example anna@example.com.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-native">Native select</Label>
            <NativeSelect id="ds-native" className="w-full" defaultValue="">
              <NativeSelectOption value="">Choose a category</NativeSelectOption>
              <NativeSelectOption value="yoga">Yoga</NativeSelectOption>
              <NativeSelectOption value="music">Music</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-select">Radix select</Label>
            <Select>
              <SelectTrigger id="ds-select" className="w-full">
                <SelectValue placeholder="Choose a duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
                <SelectItem value="90">90 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="ds-terms" />
              <Label htmlFor="ds-terms">Remind me 24 hours before</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ds-switch" />
              <Label htmlFor="ds-switch">Accept online sessions</Label>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="badges"
        title="Badges"
        note="Status is never shown by color alone: the text carries the meaning."
      >
        <div className="flex flex-wrap gap-3">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
          <Badge className="bg-success text-success-foreground">Confirmed</Badge>
          <Badge className="bg-warning text-warning-foreground">Pending payment</Badge>
        </div>
      </Section>

      <Section id="cards" title="Cards">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming session</CardTitle>
              <CardDescription>Tuesday, 20 October · 11:30</CardDescription>
            </CardHeader>
            <CardContent>Private yoga class with Anna Whitfield, 60 minutes, online.</CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Join</Button>
              <Button size="sm" variant="ghost">
                Reschedule
              </Button>
            </CardFooter>
          </Card>
          {sampleProvider && <ProviderCard provider={sampleProvider} />}
        </div>
      </Section>

      <Section
        id="overlays"
        title="Dialog and sheet"
        note="Focus moves inside when opened, Tab is trapped, Esc closes and focus returns to the trigger — handled by Radix."
      >
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel this booking?</DialogTitle>
                <DialogDescription>
                  The session is more than 24 hours away, so you will get a full refund.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Keep booking</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive">Cancel booking</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Open sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>
                  Sheets slide in from the edge; used for mobile filters and menus.
                </SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </div>
      </Section>

      <Section
        id="tabs"
        title="Tabs and accordion"
        note="Arrow keys move between tabs; Home and End jump to the first and last."
      >
        <div className="grid gap-8 md:grid-cols-2">
          <Tabs defaultValue="upcoming">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming" className="pt-3 text-muted-foreground">
              2 upcoming sessions.
            </TabsContent>
            <TabsContent value="past" className="pt-3 text-muted-foreground">
              14 past sessions.
            </TabsContent>
            <TabsContent value="cancelled" className="pt-3 text-muted-foreground">
              No cancelled sessions.
            </TabsContent>
          </Tabs>
          <Accordion type="single" collapsible>
            <AccordionItem value="a">
              <AccordionTrigger>What is the cancellation policy?</AccordionTrigger>
              <AccordionContent>
                Free cancellation up to 24 hours before the session.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Can I bring a friend?</AccordionTrigger>
              <AccordionContent>Group sessions are coming soon.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </Section>

      <Section
        id="feedback"
        title="Loading, empty and toast states"
        note="Every data view has loading, empty, error and success states."
      >
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
          <div className="space-y-6">
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="font-semibold">No bookings yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When clients book a session, it will appear here.
              </p>
            </div>
            <ToastDemo />
          </div>
        </div>
      </Section>
    </div>
  );
}
