// @vitest-environment node
//
// The concierge's tools: they see only what the deps (the user's session) give them, writes need
// the user, and an approval card describes the booking from the database, not from the model.

import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { chatToolApproval, createChatTools, type ToolDeps } from "@/lib/ai/tools";
import type { Booking } from "@/lib/booking/types";

import { seedDetails, seedSummaries } from "./fixtures";

const NOW = new Date("2026-10-26T08:00:00Z");
const USER = "00000000-0000-4000-8000-0000000000a1";
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const provider = seedDetails(seedSummaries()[0]!.slug)!;

const booking = (patch: Partial<Booking>): Booking => ({
  id: BOOKING_ID,
  providerId: provider.id,
  clientId: USER,
  serviceId: provider.services[0]!.id,
  startsAt: "2026-10-28T10:00:00Z",
  endsAt: "2026-10-28T11:00:00Z",
  status: "confirmed",
  priceCents: 5000,
  currency: "GBP",
  serviceTitle: "Yoga",
  durationMin: 60,
  providerName: provider.displayName,
  providerTimezone: "UTC",
  clientName: "Alice",
  clientEmail: "alice@example.com",
  cancelledAt: null,
  createdAt: "2026-10-20T10:00:00Z",
  expiresAt: null,
  paidCents: 5000,
  refundedCents: 0,
  ...patch,
});

function makeDeps(overrides: Partial<ToolDeps> = {}) {
  const row = {
    service_title: "Yoga",
    provider_name: provider.displayName,
    starts_at: "2026-10-28T10:00:00Z",
    duration_min: 60,
    status: "confirmed",
    client_id: USER,
  };
  const supabase = {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
    })),
    rpc: vi.fn(),
  };
  const deps: ToolDeps = {
    supabase: supabase as unknown as ToolDeps["supabase"],
    userId: USER,
    timeZone: "UTC",
    providerId: null,
    now: () => NOW,
    searchCatalog: vi.fn(async () => []),
    getProvider: vi.fn(async () => provider),
    freeSlots: vi.fn(async () => [new Date("2026-10-27T10:00:00Z")]),
    listBookings: vi.fn(async () => [booking({})]),
    cancelBooking: vi.fn(async () => ({
      ok: true as const,
      booking: {} as never,
      refund: "issued" as const,
    })),
    searchDocuments: vi.fn(async () => []),
    ...overrides,
  };
  return { deps, supabase, row };
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** A model that calls one tool, then (if asked again) says "done". */
const callingModel = (toolName: string, input: unknown) =>
  new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          { type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(input) },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      },
      {
        content: [{ type: "text", text: "done" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    ],
  });

const opts = { toolCallId: "t", messages: [] } as never;

describe("cancelBooking", () => {
  it("does not run without the user's approval; the card text comes from the database", async () => {
    const { deps } = makeDeps();
    const tools = createChatTools(deps);
    const result = await generateText({
      model: callingModel("cancelBooking", { bookingId: BOOKING_ID }),
      prompt: "cancel my booking",
      tools,
      toolApproval: chatToolApproval(deps),
    });
    expect(deps.cancelBooking).not.toHaveBeenCalled();
    const request = result.content.find((p) => p.type === "tool-approval-request");
    expect(request).toMatchObject({
      reason: `Cancel Yoga with ${provider.displayName} on Wednesday 28 October, 10:00–11:00?`,
    });
  });

  it("is denied automatically for a booking that is not the user's", async () => {
    const { deps, row } = makeDeps();
    row.client_id = "someone-else";
    const status = await chatToolApproval(deps).cancelBooking({ bookingId: BOOKING_ID });
    expect(status).toMatchObject({ type: "denied" });
  });

  it("is denied for a booking that can no longer be cancelled", async () => {
    const { deps, row } = makeDeps();
    row.status = "cancelled";
    const status = await chatToolApproval(deps).cancelBooking({ bookingId: BOOKING_ID });
    expect(status).toMatchObject({ type: "denied" });
  });
});

describe("proposeBooking", () => {
  it("proposes only a slot that is free right now, and writes nothing", async () => {
    const { deps, supabase } = makeDeps();
    const { proposeBooking } = createChatTools(deps);
    const service = provider.services[0]!;
    const ok = await proposeBooking.execute!(
      { providerSlug: provider.slug, serviceId: service.id, startsAt: "2026-10-27T10:00:00Z" },
      opts,
    );
    expect(ok).toMatchObject({ status: "proposed", proposal: { serviceId: service.id } });

    const invented = await proposeBooking.execute!(
      { providerSlug: provider.slug, serviceId: service.id, startsAt: "2026-10-27T03:17:00Z" },
      opts,
    );
    expect(invented).toEqual({ status: "unavailable" });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(deps.cancelBooking).not.toHaveBeenCalled();
  });

  it("refuses a service of another provider", async () => {
    const { deps } = makeDeps();
    const { proposeBooking } = createChatTools(deps);
    const out = await proposeBooking.execute!(
      {
        providerSlug: provider.slug,
        serviceId: "99999999-9999-4999-8999-999999999999",
        startsAt: "2026-10-27T10:00:00Z",
      },
      opts,
    );
    expect(out).toEqual({ status: "not_found" });
  });
});

describe("getMyBookings", () => {
  it("returns only what listBookings (the user's own) returns, split by scope", async () => {
    const { deps } = makeDeps({
      listBookings: vi.fn(async () => [
        booking({ id: "a" }),
        booking({ id: "b", status: "cancelled", cancelledAt: "2026-10-21T00:00:00Z" }),
        booking({ id: "c", startsAt: "2026-10-01T10:00:00Z" }),
      ]),
    });
    const { getMyBookings } = createChatTools(deps);
    const ids = async (scope: "upcoming" | "past" | "cancelled") =>
      (
        (await getMyBookings.execute!({ scope }, opts)) as { bookings: { id: string }[] }
      ).bookings.map((b) => b.id);
    expect(await ids("upcoming")).toEqual(["a"]);
    expect(await ids("past")).toEqual(["c"]);
    expect(await ids("cancelled")).toEqual(["b"]);
  });
});

describe("searchProviderInfo", () => {
  it("searches only the conversation's provider, and nothing without one", async () => {
    const { deps } = makeDeps();
    await createChatTools(deps).searchProviderInfo.execute!({ question: "cancellation?" }, opts);
    expect(deps.searchDocuments).not.toHaveBeenCalled();

    const scoped = makeDeps({ providerId: provider.id });
    await createChatTools(scoped.deps).searchProviderInfo.execute!(
      { question: "cancellation?" },
      opts,
    );
    expect(scoped.deps.searchDocuments).toHaveBeenCalledWith(provider.id, "cancellation?");
  });
});
