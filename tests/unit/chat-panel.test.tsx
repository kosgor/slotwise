// The chat UI: accessible structure, keyboard behaviour, and what it sends to /api/chat.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/booking/actions", () => ({
  bookSlot: vi.fn(async () => ({ status: "error", message: "Taken" })),
}));

import { ChatPanel } from "@/components/features/chat/chat-panel";
import type { ChatMessage } from "@/lib/ai/chat-types";

const BOOKING = "11111111-1111-4111-8111-111111111111";

const proposal: ChatMessage = {
  id: "a1",
  role: "assistant",
  parts: [
    {
      type: "tool-proposeBooking",
      toolCallId: "c1",
      state: "output-available",
      input: { providerSlug: "anna-yoga", serviceId: BOOKING, startsAt: "2026-10-27T10:00:00Z" },
      output: {
        status: "proposed",
        proposal: {
          providerSlug: "anna-yoga",
          providerName: "Anna",
          serviceId: BOOKING,
          serviceTitle: "Yoga",
          startsAt: "2026-10-27T10:00:00Z",
          label: "Tuesday, October 27, 10:00–11:00",
          duration: "1 h",
          price: "£50",
        },
      },
    },
  ] as ChatMessage["parts"],
};

const cancelRequest: ChatMessage = {
  id: "a2",
  role: "assistant",
  parts: [
    {
      type: "tool-cancelBooking",
      toolCallId: "c2",
      state: "approval-requested",
      input: { bookingId: BOOKING },
      approval: {
        id: "ap1",
        requestReason: "Cancel Yoga with Anna on Tuesday, October 27, 10:00–11:00?",
      },
    },
  ] as ChatMessage["parts"],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // An empty but valid UI message stream: enough for useChat to finish the request.
  fetchMock = vi.fn(
    async () =>
      new Response('data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n', {
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

const sentBody = (i = 0) => JSON.parse(fetchMock.mock.calls[i]![1].body as string);

describe("ChatPanel", () => {
  it("has a labelled input and a message log that does not read out streamed tokens", () => {
    render(<ChatPanel conversationId="c" initialMessages={[]} requestsLeft={12} />);
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log).toHaveAttribute("aria-live", "off");
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    expect(screen.getByText(/12 AI requests left today/)).toBeInTheDocument();
  });

  it("Enter sends, Shift+Enter does not; only the new message goes to the server", async () => {
    render(<ChatPanel conversationId="conv-1" initialMessages={[proposal]} requestsLeft={null} />);
    const input = screen.getByLabelText("Message");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body.id).toBe("conv-1");
    expect(body.message).toMatchObject({ role: "user", parts: [{ type: "text", text: "hello" }] });
    expect(body).not.toHaveProperty("messages");
  });

  it("labels the booking proposal buttons with what they do", () => {
    render(<ChatPanel conversationId="c" initialMessages={[proposal]} requestsLeft={null} />);
    expect(
      screen.getByRole("button", {
        name: "Confirm booking: Yoga with Anna, Tuesday, October 27, 10:00–11:00",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cancel proposal: Yoga with Anna/ }),
    ).toBeInTheDocument();
  });

  it("declining a proposal moves focus to the sentence that replaced the buttons", async () => {
    render(<ChatPanel conversationId="c" initialMessages={[proposal]} requestsLeft={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel proposal/ }));
    await waitFor(() => expect(screen.getByText(/Not booked/)).toHaveFocus());
  });

  it("approving a cancellation sends the approval, not a new text message", async () => {
    // The server would answer with the tool result; here the request just stays open.
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<ChatPanel conversationId="c" initialMessages={[cancelRequest]} requestsLeft={null} />);
    expect(
      screen.getByText("Cancel Yoga with Anna on Tuesday, October 27, 10:00–11:00?"),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Yes, cancel/ }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const part = sentBody().message.parts[0];
    expect(part).toMatchObject({
      state: "approval-responded",
      approval: { id: "ap1", approved: true },
    });
  });

  it("folds the search and free-time cards of a booking proposal into one collapsed group", () => {
    const withSteps = {
      ...proposal,
      parts: [
        {
          type: "tool-getAvailableSlots",
          toolCallId: "s1",
          state: "output-available",
          input: { providerSlug: "anna-yoga", date: "2026-10-27" },
          output: {
            status: "ok",
            provider: { slug: "anna-yoga", name: "Anna" },
            service: { id: BOOKING, title: "Yoga" },
            date: "2026-10-27",
            timeZone: "UTC",
            slots: [
              { startsAt: "2026-10-27T10:00:00Z", label: "Tuesday, October 27, 10:00–11:00" },
            ],
            moreSlots: 0,
          },
        },
        ...proposal.parts,
      ],
    } as ChatMessage;
    render(<ChatPanel conversationId="c" initialMessages={[withSteps]} requestsLeft={null} />);
    expect(screen.getByText("How I found this time (1 step)")).toBeInTheDocument();
    // The slot buttons are inside the closed <details>, the proposal stays in view.
    expect(screen.getByRole("button", { name: /^Confirm booking:/ })).toBeVisible();
    const slot = screen.getByRole("button", { name: "Tuesday, October 27, 10:00–11:00" });
    expect(slot.closest("details")).not.toHaveAttribute("open");
  });

  it("New chat starts an empty conversation with a new id and puts the cursor in the input", async () => {
    render(<ChatPanel conversationId="old" initialMessages={[proposal]} requestsLeft={5} />);
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryByText("Booking proposal")).toBeNull();
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveFocus());
    expect(screen.getByRole("button", { name: "New chat" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "hi" } });
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody().id).not.toBe("old");
    // The daily counter survives the new chat.
    expect(screen.getByText(/4 AI requests left today/)).toBeInTheDocument();
  });
});
