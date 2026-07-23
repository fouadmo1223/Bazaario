"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { clientEnv } from "@/shared/config/env";

/**
 * Fetch a handshake token from `/api/realtime/token`.
 *
 * The session cookie is httpOnly, so the browser cannot read it to authenticate
 * the socket; that endpoint reads it server-side and returns a 60-second token
 * instead. Callers must therefore be able to ask for a *fresh* one, which is
 * why this is a function rather than a value fetched once.
 */
async function fetchSocketToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/realtime/token", { credentials: "include" });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { token?: string } };
    return body.data?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Connect to the standalone realtime server.
 *
 * The socket lives in state, not a ref: subscribers need a re-render when it is
 * created, otherwise their `socket`-dependent effects never re-run.
 *
 * Reconnection re-mints the token. Socket.IO replays the original handshake on
 * reconnect, and the original token has a 60-second life — so after any outage
 * longer than a minute, every reconnect attempt would fail authentication and
 * the client would give up while apparently still "reconnecting".
 */
export function useSocket(): { socket: Socket | null; connected: boolean } {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const url = clientEnv.NEXT_PUBLIC_SOCKET_URL;
    if (!url) return;

    let cancelled = false;

    void (async () => {
      const token = await fetchSocketToken();
      if (cancelled || !token) return;

      const next = io(url, {
        auth: { token },
        transports: ["websocket"],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });
      socketRef.current = next;

      next.on("connect", () => setConnected(true));
      next.on("disconnect", () => setConnected(false));

      // Refresh the handshake token before each retry.
      next.io.on("reconnect_attempt", () => {
        void fetchSocketToken().then((fresh) => {
          if (fresh) next.auth = { token: fresh };
        });
      });

      setSocket(next);
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, []);

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
export function useNotifications() {
  const { socket, connected } = useSocket();
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

export type ChatMessagePayload = {
  id: string;
  conversationId: string;
  body: string;
  attachments: { url: string; name: string; mime?: string; size?: number }[];
  system: boolean;
  senderId: string | null;
  senderName: string;
  createdAt: string;
};

/**
 * Live view of one conversation.
 *
 * `initial` seeds the thread from the server render so the first paint is not
 * empty while the socket is still shaking hands. Incoming messages are
 * de-duplicated by id: the sender's own message arrives twice — once as the
 * server action's return value, once through the socket fan-out.
 */
export function useConversation(
  conversationId: string,
  initial: ChatMessagePayload[] = [],
  initialReads: Record<string, string> = {},
) {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState<ChatMessagePayload[]>(initial);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  // Per other participant, the id (or ISO time) of the newest message they have
  // read. Seeded from the server so a reload still shows "Seen" without waiting
  // for a fresh socket event.
  const [reads, setReads] = useState<Record<string, string>>(initialReads);

  const append = useCallback((message: ChatMessagePayload) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);

  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit("conversation:join", conversationId);

    const onMessage = (payload: ChatMessagePayload) => {
      if (payload.conversationId !== conversationId) return;
      append(payload);
    };
    const onTyping = ({ userId, typing }: { userId: string; typing: boolean }) => {
      setTypingUsers((prev) =>
        typing ? (prev.includes(userId) ? prev : [...prev, userId]) : prev.filter((u) => u !== userId),
      );
    };
    const onRead = ({ userId, messageId }: { userId: string; messageId: string }) => {
      setReads((prev) => ({ ...prev, [userId]: messageId }));
      // Someone who is reading is, by definition, no longer typing.
      setTypingUsers((prev) => prev.filter((u) => u !== userId));
    };

    socket.on("chat:message", onMessage);
    socket.on("conversation:typing", onTyping);
    socket.on("conversation:read", onRead);

    return () => {
      socket.emit("conversation:leave", conversationId);
      socket.off("chat:message", onMessage);
      socket.off("conversation:typing", onTyping);
      socket.off("conversation:read", onRead);
    };
  }, [socket, conversationId, append]);

  const setTyping = useCallback(
    (typing: boolean) => {
      socket?.emit("conversation:typing", { conversationId, typing });
    },
    [socket, conversationId],
  );

  /** Tell the other side we have read up to `messageId`. */
  const emitRead = useCallback(
    (messageId: string) => {
      socket?.emit("conversation:read", { conversationId, messageId });
    },
    [socket, conversationId],
  );

  return { messages, append, typingUsers, connected, setTyping, reads, emitRead };
}
