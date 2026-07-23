"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useConversation } from "@/shared/hooks/use-socket";
import {
  markConversationReadAction,
  sendMessageAction,
  setConversationStatusAction,
} from "../actions";
import type { Thread } from "../queries";

/**
 * The live thread: transcript plus composer.
 *
 * `thread.messages` seeds the transcript from the server render, so the history
 * is on screen before the socket has finished shaking hands. New messages
 * arrive over the socket; the sender's own also comes back from the action, and
 * `useConversation` de-duplicates the pair by id.
 *
 * The composer works even with the socket down — sending is a server action,
 * not a socket emit. Realtime only decides whether the *other* side's replies
 * appear without a refresh, which is why a dropped connection is reported as a
 * quiet status line rather than disabling the form.
 */
export function ThreadView({ thread, viewerId }: { thread: Thread; viewerId: string }) {
  const { messages, append, typingUsers, connected, setTyping, reads, emitRead } = useConversation(
    thread.id,
    thread.messages,
    thread.initialReads,
  );
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nameById = useMemo(
    () => new Map(thread.others.map((o) => [o.id, o.name])),
    [thread.others],
  );

  // Follow the conversation as it grows, the way every chat client does.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // When someone else's message is the latest, we have read it by looking at it.
  // Tell the other side (live receipt) and persist it (so the badge clears and
  // a reload still shows we read it). Our own sends never need marking.
  const lastMessage = messages[messages.length - 1];
  const lastId = lastMessage?.id;
  const lastIsSystem = lastMessage?.system ?? false;
  const lastSenderId = lastMessage?.senderId ?? null;
  useEffect(() => {
    if (!lastId || lastIsSystem) return;
    if (lastSenderId === viewerId) return;
    emitRead(lastId);
    void markConversationReadAction(thread.id);
  }, [lastId, lastIsSystem, lastSenderId, viewerId, emitRead, thread.id]);

  // My last message, and whether anyone on the other side has read it — the
  // "Seen" line hangs off this one bubble.
  const myLastId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.system && m.senderId === viewerId) return m.id;
    }
    return null;
  }, [messages, viewerId]);

  const seenByNames = useMemo(() => {
    if (!myLastId) return [];
    const myLast = messages.find((m) => m.id === myLastId);
    if (!myLast) return [];
    const myTime = new Date(myLast.createdAt).getTime();
    return thread.others
      .filter((o) => {
        const readId = reads[o.id];
        if (!readId) return false;
        const readMsg = messages.find((m) => m.id === readId);
        return readMsg ? new Date(readMsg.createdAt).getTime() >= myTime : false;
      })
      .map((o) => o.name);
  }, [myLastId, messages, reads, thread.others]);

  // Stop broadcasting "typing" if the component goes away mid-sentence,
  // otherwise the other side sees a typing indicator that never clears.
  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, []);

  function onChange(value: string) {
    setBody(value);
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 2000);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if (!text || pending) return;

    setError(null);
    setTyping(false);

    startTransition(async () => {
      const result = await sendMessageAction({ conversationId: thread.id, body: text, attachments: [] });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // Only clear the box once the send is known to have worked — losing a
      // typed message to a failed request is unforgivable.
      setBody("");
      append(result.data);
    });
  }

  function onStatus(status: "resolved" | "closed" | "open") {
    startTransition(async () => {
      const result = await setConversationStatusAction({ conversationId: thread.id, status });
      if (!result.ok) setError(result.error.message);
    });
  }

  const readOnly = thread.status === "closed";

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {thread.subject || thread.vendorName || thread.counterparties.join(", ") || "Conversation"}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {thread.counterparties.length > 0 ? `with ${thread.counterparties.join(", ")}` : "No one else has replied yet"}
            {" · "}
            <span>{thread.status}</span>
          </p>
        </div>

        {thread.canModerate ? (
          <div className="flex items-center gap-2">
            {thread.status === "closed" ? (
              <button
                type="button"
                onClick={() => onStatus("open")}
                disabled={pending}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Reopen
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onStatus("resolved")}
                  disabled={pending}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Mark resolved
                </button>
                <button
                  type="button"
                  onClick={() => onStatus("closed")}
                  disabled={pending}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Close
                </button>
              </>
            )}
          </div>
        ) : null}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto py-6">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">No messages yet.</p>
        ) : null}

        {messages.map((message) => {
          if (message.system) {
            return (
              <p key={message.id} className="py-1 text-center text-xs text-zinc-400">
                {message.body}
              </p>
            );
          }

          const mine = message.senderId === viewerId;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"}`}>
                {!mine ? (
                  <p className="mb-0.5 px-1 text-[11px] font-medium text-zinc-500">{message.senderName}</p>
                ) : null}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    mine
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  {message.body}
                </div>
                <p className={`mt-0.5 px-1 text-[11px] text-zinc-400 ${mine ? "text-right" : ""}`}>
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                {mine && message.id === myLastId ? (
                  <p className="px-1 text-right text-[11px] text-zinc-400" aria-live="polite">
                    {seenByNames.length > 0
                      ? thread.others.length > 1
                        ? `Seen by ${seenByNames.join(", ")}`
                        : "Seen"
                      : connected
                        ? "Sent"
                        : "Sending…"}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}

        {typingUsers.length > 0 ? (
          <div className="flex items-center gap-2 px-1" aria-live="polite">
            <span className="flex gap-1">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </span>
            <span className="text-xs text-zinc-400">
              {(() => {
                const names = typingUsers.map((id) => nameById.get(id)).filter(Boolean) as string[];
                if (names.length === 0) return "Typing…";
                if (names.length === 1) return `${names[0]} is typing…`;
                return `${names.join(", ")} are typing…`;
              })()}
            </span>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        {error ? (
          <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {readOnly ? (
          <p className="py-3 text-center text-sm text-zinc-500">
            This conversation is closed.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <label htmlFor="chat-body" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-body"
              value={body}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line — the convention
                // every chat app has trained people to expect.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              maxLength={5000}
              placeholder="Write a message…"
              className="flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={pending || body.trim().length === 0}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </form>
        )}

        <p className="mt-2 text-[11px] text-zinc-400">
          {connected ? "Connected — new replies appear instantly." : "Offline — replies appear on refresh."}
        </p>
      </div>
    </div>
  );
}

/** One bouncing dot of the typing indicator; `delay` staggers the three. */
function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
      style={{ animationDelay: delay }}
    />
  );
}
