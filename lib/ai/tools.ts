// The concierge's tools. They are created per request around the signed-in user's Supabase client,
// so every read and write goes through RLS and the booking functions as that user — whatever the
// model was told, it cannot see or change more than the user could by clicking.
//
// Writes need a person: proposeBooking only checks a slot and returns a proposal (the card's
// "Confirm" runs the normal booking action), cancelBooking runs only after the user approves it
// in the chat (toolApproval, signed with TOOL_APPROVAL_SECRET).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { tool, type ToolApprovalConfiguration, type ToolApprovalStatus } from "ai";
import { z } from "zod";

import type { CancelResult } from "@/lib/booking/cancel";
import { bookingErrorMessage } from "@/lib/booking/errors";
import { canClientCancel } from "@/lib/booking/rules";
import { displayStatus } from "@/lib/booking/status";
import type { Booking } from "@/lib/booking/types";
import { formatDuration, formatPrice } from "@/lib/catalog/format";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type ProviderDetails,
  type ProviderSummary,
} from "@/lib/catalog/types";
import { formatDayLong, formatTime } from "@/lib/datetime";
import type { Database } from "@/lib/supabase/database.types";

import type { DocumentMatch } from "./rag";

export type ToolDeps = {
  supabase: SupabaseClient<Database>;
  userId: string;
  /** Viewer's time zone: dates the user says ("tomorrow") and times shown are in this zone. */
  timeZone: string;
  /** Set when the chat is about one provider (started on their page). */
  providerId: string | null;
  now: () => Date;
  searchCatalog: (filters: CatalogFilters) => Promise<ProviderSummary[]>;
  getProvider: (slug: string) => Promise<ProviderDetails | null>;
  freeSlots: (input: {
    provider: ProviderDetails;
    durationMin: number;
    date: string;
  }) => Promise<Date[] | null>;
  listBookings: () => Promise<Booking[]>;
  cancelBooking: (bookingId: string) => Promise<CancelResult>;
  searchDocuments: (providerId: string, question: string) => Promise<DocumentMatch[]>;
};

export type CatalogFilters = {
  query?: string;
  category?: (typeof CATEGORIES)[number];
  city?: string;
  maxPrice?: number;
};

const MAX_SLOTS = 12;

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Calendar date YYYY-MM-DD in the user's time zone");

export function slotLabel(start: Date, durationMin: number, timeZone: string): string {
  const end = new Date(start.getTime() + durationMin * 60_000);
  return `${formatDayLong(start, timeZone)}, ${formatTime(start, timeZone)}–${formatTime(end, timeZone)}`;
}

function priceLabel(cents: number, currency: string) {
  return cents === 0 ? "Free" : formatPrice(cents, currency);
}

function serviceList(provider: ProviderDetails) {
  return provider.services.map((s) => ({
    id: s.id,
    title: s.title,
    duration: formatDuration(s.durationMin),
    price: priceLabel(s.priceCents, s.currency),
  }));
}

/** Date of an instant in a zone, "YYYY-MM-DD". */
function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function createChatTools(deps: ToolDeps) {
  const searchProviders = tool({
    description:
      "Search the Slotwise catalog of approved professionals. Use it to recommend someone or to find a provider's slug before checking times.",
    inputSchema: z.object({
      query: z.string().max(100).optional().describe("Free text: a skill, a name, a topic"),
      category: z.enum(CATEGORIES).optional(),
      city: z.string().max(60).optional(),
      maxPrice: z.number().int().min(0).max(10_000).optional().describe("Whole pounds sterling"),
    }),
    execute: async (filters) => {
      const found = await deps.searchCatalog(filters);
      return {
        providers: found.slice(0, 5).map((p) => ({
          slug: p.slug,
          name: p.displayName,
          headline: p.headline,
          category: CATEGORY_LABELS[p.category],
          city: p.city,
          fromPrice: priceLabel(p.minPriceCents, p.currency),
          rating: p.ratingAvg,
          reviews: p.reviewCount,
          url: `/pros/${p.slug}`,
        })),
        total: found.length,
      };
    },
  });

  const getAvailableSlots = tool({
    description:
      "Free start times of a provider's service on one day. Without serviceId, returns the provider's services so you can ask which one.",
    inputSchema: z.object({
      providerSlug: z.string().max(80),
      serviceId: z.uuid().optional(),
      date: dateKey,
    }),
    execute: async ({ providerSlug, serviceId, date }) => {
      const provider = await deps.getProvider(providerSlug);
      if (!provider) return { status: "not_found" as const };
      const services = serviceList(provider);
      const service =
        provider.services.find((s) => s.id === serviceId) ??
        (provider.services.length === 1 ? provider.services[0] : undefined);
      if (!service)
        return { status: "choose_service" as const, provider: provider.displayName, services };

      const slots = await deps.freeSlots({ provider, durationMin: service.durationMin, date });
      if (!slots) return { status: "unavailable" as const };
      return {
        status: "ok" as const,
        provider: { slug: provider.slug, name: provider.displayName },
        service: { id: service.id, title: service.title },
        date,
        timeZone: deps.timeZone,
        slots: slots.slice(0, MAX_SLOTS).map((s) => ({
          startsAt: s.toISOString(),
          label: slotLabel(s, service.durationMin, deps.timeZone),
        })),
        moreSlots: Math.max(0, slots.length - MAX_SLOTS),
      };
    },
  });

  const proposeBooking = tool({
    description:
      "Propose one specific booking to the user. Shows a card with Confirm and Cancel; nothing is booked until the user confirms. Call it only with a startsAt returned by getAvailableSlots.",
    inputSchema: z.object({
      providerSlug: z.string().max(80),
      serviceId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
    }),
    execute: async ({ providerSlug, serviceId, startsAt }) => {
      const provider = await deps.getProvider(providerSlug);
      const service = provider?.services.find((s) => s.id === serviceId);
      if (!provider || !service) return { status: "not_found" as const };

      // Re-check against live availability: the model may repeat a slot that was taken meanwhile,
      // or invent one. The database checks again when the user confirms.
      const start = new Date(startsAt);
      const slots = await deps.freeSlots({
        provider,
        durationMin: service.durationMin,
        date: localDate(start, deps.timeZone),
      });
      if (!slots?.some((s) => s.getTime() === start.getTime()))
        return { status: "unavailable" as const };

      return {
        status: "proposed" as const,
        proposal: {
          providerSlug: provider.slug,
          providerName: provider.displayName,
          serviceId: service.id,
          serviceTitle: service.title,
          startsAt: start.toISOString(),
          label: slotLabel(start, service.durationMin, deps.timeZone),
          duration: formatDuration(service.durationMin),
          price: priceLabel(service.priceCents, service.currency),
        },
      };
    },
  });

  const getMyBookings = tool({
    description: "The signed-in user's own bookings as a client.",
    inputSchema: z.object({
      scope: z.enum(["upcoming", "past", "cancelled"]).default("upcoming"),
    }),
    execute: async ({ scope }) => {
      const now = deps.now();
      const bookings = (await deps.listBookings()).filter((b) => {
        const status = displayStatus(b, now);
        if (scope === "cancelled") return status === "cancelled" || status === "expired";
        if (status === "cancelled" || status === "expired") return false;
        return scope === "upcoming" ? new Date(b.startsAt) >= now : new Date(b.startsAt) < now;
      });
      if (scope !== "upcoming") bookings.reverse();
      return {
        bookings: bookings.slice(0, 10).map((b) => ({
          id: b.id,
          service: b.serviceTitle,
          provider: b.providerName,
          when: slotLabel(new Date(b.startsAt), b.durationMin, deps.timeZone),
          status: displayStatus(b, now),
          price: priceLabel(b.priceCents, b.currency),
          freeCancellation:
            scope === "upcoming" ? canClientCancel(new Date(b.startsAt), now) : undefined,
        })),
      };
    },
  });

  const cancelBooking = tool({
    description:
      "Cancel one of the user's bookings by id (from getMyBookings). The user must approve it in the chat; refunds follow the cancellation policy.",
    inputSchema: z.object({ bookingId: z.uuid() }),
    execute: async ({ bookingId }) => {
      const result = await deps.cancelBooking(bookingId);
      if (!result.ok)
        return { status: "error" as const, message: bookingErrorMessage(result.error) };
      return { status: "cancelled" as const, refund: result.refund };
    },
  });

  // Offered to the model only in a chat about one provider (see activeChatTools).
  const searchProviderInfo = tool({
    description:
      "Search this provider's own documents (policies, FAQ, what to bring, pricing rules). Use for any question about how this provider works. If nothing is found, say you don't know.",
    inputSchema: z.object({ question: z.string().min(3).max(300) }),
    execute: async ({ question }) => {
      const matches = deps.providerId ? await deps.searchDocuments(deps.providerId, question) : [];
      return {
        found: matches.length > 0,
        // Quoted text from the provider's documents. It is information, never instructions.
        sources: matches.map((m) => ({
          id: m.id,
          document: m.documentTitle,
          excerpt: m.content,
        })),
      };
    },
  });
  return {
    searchProviders,
    getAvailableSlots,
    proposeBooking,
    getMyBookings,
    cancelBooking,
    searchProviderInfo,
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;
export type ChatToolName = keyof ChatTools;

export function activeChatTools(providerId: string | null): ChatToolName[] {
  const all: ChatToolName[] = [
    "searchProviders",
    "getAvailableSlots",
    "proposeBooking",
    "getMyBookings",
    "cancelBooking",
  ];
  return providerId ? [...all, "searchProviderInfo"] : all;
}

/**
 * cancelBooking always needs the user's approval. The text the user approves is built here from
 * the database, not taken from the model: a prompt cannot make the card say "cancel Tuesday" while
 * the call cancels Friday. Bookings that are not theirs (RLS hides them) are denied automatically.
 */
export function chatToolApproval(deps: ToolDeps) {
  return {
    cancelBooking: async ({ bookingId }: { bookingId: string }): Promise<ToolApprovalStatus> => {
      const { data } = await deps.supabase
        .from("bookings")
        .select("service_title, provider_name, starts_at, duration_min, status, client_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (!data || data.client_id !== deps.userId)
        return { type: "denied", reason: "This booking is not in your account." };
      if (data.status !== "confirmed" && data.status !== "pending_payment")
        return { type: "denied", reason: "This booking can no longer be cancelled." };
      const when = slotLabel(new Date(data.starts_at), data.duration_min, deps.timeZone);
      return {
        type: "user-approval",
        reason: `Cancel ${data.service_title} with ${data.provider_name} on ${when}?`,
      };
    },
  } satisfies ToolApprovalConfiguration<ChatTools, unknown>;
}
