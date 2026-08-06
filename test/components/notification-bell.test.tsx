import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationBell } from "@/features/notifications/components/notification-bell";

/**
 * Two sources feed the badge: the server count (a prop here, since there is no
 * StorefrontProvider in these tests — `useStorefront` falls back to null on its
 * own) and live socket arrivals. `useSocket` and the mark-read server actions
 * are mocked so these stay unit tests of that reconciliation, not an
 * integration test of sockets or Mongo.
 */

const { fakeSocket, pushMock, refreshMock, markReadMock, markAllReadMock } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      listeners.get(event)?.delete(handler);
    },
    emit: () => {},
    trigger: (event: string, payload?: unknown) => {
      for (const handler of listeners.get(event) ?? []) handler(payload);
    },
  };
  return {
    fakeSocket: socket,
    pushMock: vi.fn(),
    refreshMock: vi.fn(),
    markReadMock: vi.fn(async () => ({ ok: true, data: null })),
    markAllReadMock: vi.fn(async () => ({ ok: true, data: { updated: 0 } })),
  };
});

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/shared/hooks/use-socket", () => ({
  useSocket: () => ({ socket: fakeSocket, connected: true }),
}));

vi.mock("@/features/notifications/actions", () => ({
  markNotificationReadAction: markReadMock,
  markAllNotificationsReadAction: markAllReadMock,
}));

beforeEach(() => {
  pushMock.mockClear();
  refreshMock.mockClear();
  markReadMock.mockClear();
  markAllReadMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NotificationBell", () => {
  it("shows no badge when there is nothing unread", () => {
    render(<NotificationBell initialUnread={0} />);
    expect(screen.queryByText(/^\d+\+?$/)).not.toBeInTheDocument();
  });

  it("starts from the server count and bumps on a live arrival", () => {
    render(<NotificationBell initialUnread={2} />);
    expect(screen.getByLabelText("Notifications (2 unread)")).toBeInTheDocument();

    act(() => {
      fakeSocket.trigger("notification", {
        id: "n1",
        title: "New order",
        createdAt: new Date().toISOString(),
      });
    });

    expect(screen.getByLabelText("Notifications (3 unread)")).toBeInTheDocument();
  });

  it("lets a refreshed server count win over a stale live bump", () => {
    const { rerender } = render(<NotificationBell initialUnread={2} />);
    act(() => {
      fakeSocket.trigger("notification", { id: "n1", title: "New order" });
    });
    expect(screen.getByLabelText("Notifications (3 unread)")).toBeInTheDocument();

    // A navigation re-renders with a fresh server count of 0 — it should win
    // outright rather than being added to the live bump.
    rerender(<NotificationBell initialUnread={0} />);
    expect(screen.queryByText(/^\d+\+?$/)).not.toBeInTheDocument();
  });

  it("lazy-loads the list only when opened", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          unread: 1,
          items: [
            {
              id: "n1",
              type: "system",
              title: "New order",
              body: "Order #1 was placed",
              link: null,
              readAt: null,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationBell initialUnread={1} />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Notifications (1 unread)"));

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications", { cache: "no-store" });
    await waitFor(() => expect(screen.getByText("New order")).toBeInTheDocument());
  });

  it("marking all read zeroes the badge and refreshes the count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, data: { unread: 2, items: [] } }),
      })),
    );

    render(<NotificationBell initialUnread={2} />);
    // The "Mark all read" control only exists inside the open panel.
    fireEvent.click(screen.getByLabelText("Notifications (2 unread)"));
    await waitFor(() => expect(screen.getByText("Mark all read")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Mark all read"));

    expect(screen.queryByText(/^\d+\+?$/)).not.toBeInTheDocument();
    await waitFor(() => expect(markAllReadMock).toHaveBeenCalled());
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
