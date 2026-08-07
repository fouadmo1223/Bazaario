import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { ThreadView } from "@/features/messages/components/thread-view";
import type { Thread } from "@/features/messages/queries";
import type { ChatMessagePayload } from "@/shared/hooks/use-socket";
import messages from "@/i18n/messages/en.json";

function render(ui: ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/**
 * `useConversation` (typing state, read receipts, socket relay) is mocked
 * directly rather than driven through a fake socket: the state-shape it hands
 * back to `ThreadView` — `typingUsers`, `reads`, `connected` — is the seam
 * this file is testing, i.e. does the transcript render the right "typing"
 * and "Seen"/"Sent" line for a given state.
 */

const { useConversationMock, markReadMock, sendMessageMock, setStatusMock } = vi.hoisted(() => ({
  useConversationMock: vi.fn(),
  markReadMock: vi.fn(async () => undefined),
  sendMessageMock: vi.fn(),
  setStatusMock: vi.fn(),
}));

vi.mock("@/shared/hooks/use-socket", () => ({
  useConversation: useConversationMock,
}));

vi.mock("@/features/messages/actions", () => ({
  markConversationReadAction: markReadMock,
  sendMessageAction: sendMessageMock,
  setConversationStatusAction: setStatusMock,
}));

const viewerId = "viewer1";

const baseThread: Thread = {
  id: "conv1",
  kind: "customer_vendor",
  status: "open",
  subject: null,
  vendorName: null,
  counterparties: ["Casey Customer"],
  others: [{ id: "user2", name: "Casey Customer" }],
  initialReads: {},
  orderId: null,
  messages: [],
  canModerate: false,
};

function message(overrides: Partial<ChatMessagePayload>): ChatMessagePayload {
  return {
    id: "m1",
    conversationId: "conv1",
    body: "Hello",
    attachments: [],
    system: false,
    senderId: "user2",
    senderName: "Casey Customer",
    createdAt: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

function mockConversation(overrides: Partial<ReturnType<typeof useConversationMock>>) {
  useConversationMock.mockReturnValue({
    messages: [],
    append: vi.fn(),
    typingUsers: [],
    connected: true,
    setTyping: vi.fn(),
    reads: {},
    emitRead: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  markReadMock.mockClear();
  sendMessageMock.mockClear();
  setStatusMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ThreadView typing indicator", () => {
  it("names the single person typing, with animated dots", () => {
    mockConversation({ typingUsers: ["user2"] });
    render(<ThreadView thread={baseThread} viewerId={viewerId} />);
    expect(screen.getByText("Casey Customer is typing…")).toBeInTheDocument();
  });

  it("lists everyone typing when more than one person is", () => {
    mockConversation({
      typingUsers: ["user2", "user3"],
    });
    const thread: Thread = {
      ...baseThread,
      others: [...baseThread.others, { id: "user3", name: "Sam Staff" }],
    };
    render(<ThreadView thread={thread} viewerId={viewerId} />);
    expect(screen.getByText("Casey Customer, Sam Staff are typing…")).toBeInTheDocument();
  });

  it("shows nothing when nobody is typing", () => {
    mockConversation({ typingUsers: [] });
    render(<ThreadView thread={baseThread} viewerId={viewerId} />);
    expect(screen.queryByText(/typing…/)).not.toBeInTheDocument();
  });

  it("debounces: typing sets the flag, then clears it after a pause", () => {
    vi.useFakeTimers();
    const setTyping = vi.fn();
    mockConversation({ setTyping });
    render(<ThreadView thread={baseThread} viewerId={viewerId} />);

    fireEvent.change(screen.getByPlaceholderText("Write a message…"), {
      target: { value: "hi" },
    });
    expect(setTyping).toHaveBeenCalledWith(true);

    vi.advanceTimersByTime(2000);
    expect(setTyping).toHaveBeenLastCalledWith(false);
  });
});

describe("ThreadView read receipts", () => {
  it("shows Sent for the viewer's last message when nobody has read it yet", () => {
    mockConversation({
      messages: [message({ id: "m1", senderId: viewerId, senderName: "Me" })],
      reads: {},
      connected: true,
    });
    render(<ThreadView thread={baseThread} viewerId={viewerId} />);
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });

  it("shows Sending… for the viewer's last message while the socket is down", () => {
    mockConversation({
      messages: [message({ id: "m1", senderId: viewerId, senderName: "Me" })],
      reads: {},
      connected: false,
    });
    render(<ThreadView thread={baseThread} viewerId={viewerId} />);
    expect(screen.getByText("Sending…")).toBeInTheDocument();
  });

  it("flips Sent to Seen once the other participant's read catches up", () => {
    const last = message({ id: "m1", senderId: viewerId, senderName: "Me" });
    mockConversation({
      messages: [last],
      reads: { user2: "m1" },
      connected: true,
    });
    render(<ThreadView thread={baseThread} viewerId={viewerId} />);
    expect(screen.getByText("Seen")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
  });

  it("names readers when more than one other participant has seen it", () => {
    const last = message({ id: "m1", senderId: viewerId, senderName: "Me" });
    const thread: Thread = {
      ...baseThread,
      others: [...baseThread.others, { id: "user3", name: "Sam Staff" }],
    };
    mockConversation({
      messages: [last],
      reads: { user2: "m1", user3: "m1" },
      connected: true,
    });
    render(<ThreadView thread={thread} viewerId={viewerId} />);
    expect(screen.getByText("Seen by Casey Customer, Sam Staff")).toBeInTheDocument();
  });

  it("does not mark the viewer's own message as read via a stale read pointer", () => {
    // The other participant's read points at an earlier message than the
    // viewer's latest send — that is not "seen" for the latest bubble.
    const earlier = message({
      id: "m0",
      senderId: "user2",
      senderName: "Casey Customer",
      createdAt: "2026-07-20T09:00:00.000Z",
    });
    const last = message({
      id: "m1",
      senderId: viewerId,
      senderName: "Me",
      createdAt: "2026-07-20T10:00:00.000Z",
    });
    mockConversation({
      messages: [earlier, last],
      reads: { user2: "m0" },
      connected: true,
    });
    render(<ThreadView thread={baseThread} viewerId={viewerId} />);
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
  });
});
