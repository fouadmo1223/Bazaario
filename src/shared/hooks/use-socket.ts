"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { clientEnv } from "@/shared/config/env";

/**
 * Connects to the standalone realtime server. The access token is httpOnly, so
 * the page passes a short-lived socket token fetched from an endpoint rather
 * than reading the cookie directly.
 *
 * The socket lives in state, not a ref: subscribers need a re-render when it is
 * created, otherwise their `socket`-dependent effects never re-run.
 */
export function useSocket(token: string | null): { socket: Socket | null; connected: boolean } {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const url = clientEnv.NEXT_PUBLIC_SOCKET_URL;
    if (!url) return;

    const next = io(url, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    // The socket is created by connecting to an external system, so publishing
    // the instance from the effect is the only place it can come from.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(next);

    next.on("connect", () => setConnected(true));
    next.on("disconnect", () => setConnected(false));

    return () => {
      next.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  return { socket, connected };
}

export type NotificationPayload = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  createdAt?: string;
};

/** Subscribe to live notifications, keeping an unread counter. */
export function useNotifications(token: string | null) {
  const { socket, connected } = useSocket(token);
  const [items, setItems] = useState<NotificationPayload[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!socket) return;
    const onNotification = (payload: NotificationPayload) => {
      setItems((prev) => [payload, ...prev].slice(0, 50));
      setUnread((n) => n + 1);
    };
    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
  }, [socket]);

  return { items, unread, connected, clearUnread: () => setUnread(0) };
}
