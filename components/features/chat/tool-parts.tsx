"use client";

import { CalendarCheckIcon, FileTextIcon, Loader2Icon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chat-types";
import { bookSlot } from "@/lib/booking/actions";

type Part = ChatMessage["parts"][number];

type Props = {
  part: Part;
  onApproval: (approvalId: string, approved: boolean) => void;
  onPickSlot: (label: string) => void;
  disabled: boolean;
};

const PENDING: Record<string, string> = {
  "tool-searchProviders": "Searching the catalog…",
  "tool-getAvailableSlots": "Checking free times…",
  "tool-proposeBooking": "Preparing a booking…",
  "tool-getMyBookings": "Looking at your bookings…",
  "tool-cancelBooking": "Checking the booking…",
  "tool-searchProviderInfo": "Reading the provider's documents…",
};

const card = "rounded-xl border bg-background p-3 text-sm";

function Pending({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </p>
  );
}

export function ToolPart({ part, onApproval, onPickSlot, disabled }: Props) {
  if (!("state" in part) || !("toolCallId" in part)) return null;
  if (part.state === "input-streaming" || part.state === "input-available")
    return <Pending label={PENDING[part.type] ?? "Working…"} />;
  if (part.state === "output-error")
    return <p className="text-sm text-destructive">This step failed. Ask again in a moment.</p>;

  switch (part.type) {
    case "tool-searchProviders": {
      if (part.state !== "output-available") return null;
      const { providers } = part.output;
      if (providers.length === 0)
        return <p className="text-muted-foreground">No professionals match this search.</p>;
      return (
        <div className={card}>
          <p className="mb-2 flex items-center gap-1.5 font-medium">
            <SearchIcon className="size-4" aria-hidden="true" />
            Professionals found
          </p>
          <ul className="space-y-2">
            {providers.map((p) => (
              <li key={p.slug}>
                <Link
                  href={p.url}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {p.name}
                </Link>{" "}
                — {p.headline}. {p.category}, {p.city}, from {p.fromPrice}
                {p.rating !== null && `, rated ${p.rating} (${p.reviews})`}.
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "tool-getAvailableSlots": {
      if (part.state !== "output-available") return null;
      const out = part.output;
      if (out.status === "choose_service")
        return (
          <div className={card}>
            <p className="font-medium">Services of {out.provider}</p>
            <ul className="mt-1 list-disc pl-5">
              {out.services.map((s) => (
                <li key={s.id}>
                  {s.title} · {s.duration} · {s.price}
                </li>
              ))}
            </ul>
          </div>
        );
      if (out.status !== "ok")
        return <p className="text-muted-foreground">Free times could not be loaded.</p>;
      if (out.slots.length === 0)
        return (
          <p className="text-muted-foreground">
            No free times for {out.service.title} on this day.
          </p>
        );
      return (
        <div className={card}>
          <p className="mb-2 font-medium">
            Free times: {out.service.title} with {out.provider.name}
          </p>
          <ul className="flex flex-wrap gap-2">
            {out.slots.map((s) => (
              <li key={s.startsAt}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onPickSlot(s.label)}
                >
                  {s.label}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "tool-proposeBooking": {
      if (part.state !== "output-available") return null;
      if (part.output.status !== "proposed")
        return (
          <p className="text-muted-foreground">
            This time is not available any more. Ask for other times.
          </p>
        );
      return <BookingProposal proposal={part.output.proposal} />;
    }

    case "tool-getMyBookings": {
      if (part.state !== "output-available") return null;
      const { bookings } = part.output;
      if (bookings.length === 0) return <p className="text-muted-foreground">No bookings here.</p>;
      return (
        <div className={card}>
          <p className="mb-2 font-medium">Your bookings</p>
          <ul className="space-y-1">
            {bookings.map((b) => (
              <li key={b.id}>
                {b.service} with {b.provider} — {b.when} · {b.price}
              </li>
            ))}
          </ul>
          <Link
            href="/account"
            className="mt-2 inline-block font-medium text-primary underline-offset-4 hover:underline"
          >
            Open My bookings
          </Link>
        </div>
      );
    }

    case "tool-cancelBooking":
      return <CancelApproval part={part} onApproval={onApproval} />;

    case "tool-searchProviderInfo": {
      if (part.state !== "output-available") return null;
      const titles = [...new Set(part.output.sources.map((s) => s.document))];
      return (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileTextIcon className="size-3.5" aria-hidden="true" />
          {titles.length > 0
            ? `Sources: ${titles.join(", ")}`
            : "Nothing about this in the provider's documents."}
        </p>
      );
    }
  }
  return null;
}

type Proposal = Extract<
  Extract<Part, { type: "tool-proposeBooking"; state: "output-available" }>["output"],
  { status: "proposed" }
>["proposal"];

/** "Confirm" runs the same booking action as the booking page: the database checks everything. */
function BookingProposal({ proposal }: { proposal: Proposal }) {
  const [state, setState] = useState<"open" | "declined" | "error">("open");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const what = `${proposal.serviceTitle} with ${proposal.providerName}, ${proposal.label}`;

  // After a button disappears, focus goes to the sentence that replaced it, not to <body>.
  const focusStatus = () => requestAnimationFrame(() => statusRef.current?.focus());

  return (
    <div className={card}>
      <p className="flex items-center gap-1.5 font-medium">
        <CalendarCheckIcon className="size-4" aria-hidden="true" />
        Booking proposal
      </p>
      <p className="mt-1">
        {proposal.serviceTitle} with {proposal.providerName}
        <br />
        {proposal.label} · {proposal.duration} · {proposal.price}
      </p>
      {state === "open" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            aria-busy={pending || undefined}
            aria-label={`Confirm booking: ${what}`}
            onClick={() =>
              startTransition(async () => {
                // Success redirects (to Stripe Checkout or My bookings); only errors come back.
                const result = await bookSlot({
                  serviceId: proposal.serviceId,
                  startsAt: proposal.startsAt,
                });
                if (result.status === "error") {
                  setMessage(result.message ?? "This time could not be booked.");
                  setState("error");
                  focusStatus();
                }
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
            {pending ? "Booking…" : "Confirm"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            aria-label={`Cancel proposal: ${what}`}
            onClick={() => {
              setState("declined");
              focusStatus();
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <p
          ref={statusRef}
          tabIndex={-1}
          role={state === "error" ? "alert" : "status"}
          className={state === "error" ? "mt-2 text-destructive" : "mt-2 text-muted-foreground"}
        >
          {state === "error" ? message : "Not booked. Ask for another time whenever you like."}
        </p>
      )}
    </div>
  );
}

type CancelPart = Extract<Part, { type: "tool-cancelBooking" }>;

function CancelApproval({
  part,
  onApproval,
}: {
  part: CancelPart;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const answer = (approved: boolean) => {
    if (part.state !== "approval-requested") return;
    onApproval(part.approval.id, approved);
    requestAnimationFrame(() => statusRef.current?.focus());
  };

  const reason = "approval" in part ? part.approval?.requestReason : undefined;
  let status: string | null = null;
  if (part.state === "approval-responded")
    status = part.approval.approved ? "Cancelling…" : "Kept. Nothing was cancelled.";
  if (part.state === "output-denied")
    status = part.approval.reason ?? "Kept. Nothing was cancelled.";
  if (part.state === "output-available")
    status =
      part.output.status === "cancelled"
        ? part.output.refund === "none"
          ? "Cancelled."
          : part.output.refund === "issued"
            ? "Cancelled. The refund is on its way."
            : "Cancelled. The refund will be issued within a few minutes."
        : part.output.message;

  return (
    <div className={card}>
      <p className="font-medium">{reason ?? "Cancel this booking?"}</p>
      {part.state === "approval-requested" && !part.approval.isAutomatic ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            aria-label={`Yes, cancel. ${reason ?? ""}`.trim()}
            onClick={() => answer(true)}
          >
            Yes, cancel
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => answer(false)}>
            Keep booking
          </Button>
        </div>
      ) : null}
      <p ref={statusRef} tabIndex={-1} role="status" className="mt-2 text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
