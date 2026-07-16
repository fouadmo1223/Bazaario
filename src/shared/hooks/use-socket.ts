"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { clientEnv } from "@/shared/config/env";

/**
 * Connects to the standalone realtime server. The access token is httpOnly, so
 * the page passes a short-lived socket token fetched from an endpoint rather
 * than reading the cookie directly.
 */
export function useSocket(token: string | null): { socket: Socket | null; connected: boolean } {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const url = clientEnv.NEXT_PUBLIC_SOCKET_URL;
    if (!url) return;

    const socket = io(url, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  return { socket: socketRef.current, connected };
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
