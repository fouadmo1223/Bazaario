"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useConversation } from "@/shared/hooks/use-socket";
import {
  markConversationReadAction,
  sendMessageAction,
  setConversationStatusAction,
} from "../actions";
import { EmojiPicker } from "./emoji-picker";
import { attachmentKind, uploadChatFile, type ChatAttachment } from "../upload";
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
  const t = useTranslations("ThreadView");
  const tStatus = useTranslations("ConversationStatus");
  const { messages, append, typingUsers, connected, setTyping, reads, emitRead } = useConversation(
    thread.id,
    thread.messages,
    thread.initialReads,
  );
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setBody((b) => b + emoji);
      return;
    }
    // Splice the emoji in at the caret rather than always appending, so it lands
    // where the writer is looking.
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  }

  async function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const chosen = Array.from(files);
    setUploading((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const attachment = await uploadChatFile(file);
        setAttachments((prev) => [...prev, attachment]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if ((!text && attachments.length === 0) || pending || uploading > 0) return;

    setError(null);
    setTyping(false);

    const outgoing = attachments;
    startTransition(async () => {
      const result = await sendMessageAction({
        conversationId: thread.id,
        body: text,
        attachments: outgoing,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // Only clear the box once the send is known to have worked — losing a
      // typed message to a failed request is unforgivable.
      setBody("");
      setAttachments([]);
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
            {thread.subject || thread.vendorName || thread.counterparties.join(", ") || t("conversation")}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {thread.counterparties.length > 0
              ? t("withNames", { names: thread.counterparties.join(", ") })
              : t("noOneReplied")}
            {" · "}
            <span>{tStatus(thread.status)}</span>
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
                {t("reopen")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onStatus("resolved")}
                  disabled={pending}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  {t("markResolved")}
                </button>
                <button
                  type="button"
                  onClick={() => onStatus("closed")}
                  disabled={pending}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  {t("close")}
                </button>
              </>
            )}
          </div>
        ) : null}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto py-6">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">{t("noMessagesYet")}</p>
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
                {message.body ? (
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      mine
                        ? "bg-brand text-white"
                        : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    }`}
                  >
                    {message.body}
                  </div>
                ) : null}
                {message.attachments.length > 0 ? (
                  <div className={`mt-1 flex flex-col gap-1.5 ${mine ? "items-end" : "items-start"}`}>
                    {message.attachments.map((a, i) => (
                      <Attachment key={`${a.url}-${i}`} attachment={a} />
                    ))}
                  </div>
                ) : null}
                <p className={`mt-0.5 px-1 text-[11px] text-zinc-400 ${mine ? "text-right" : ""}`}>
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                {mine && message.id === myLastId ? (
                  <p className="px-1 text-right text-[11px] text-zinc-400" aria-live="polite">
                    {seenByNames.length > 0
                      ? thread.others.length > 1
                        ? t("seenBy", { names: seenByNames.join(", ") })
                        : t("seen")
                      : connected
                        ? t("sent")
                        : t("sending")}
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
                if (names.length === 0) return t("typing");
                if (names.length === 1) return t("oneTyping", { name: names[0] });
                return t("multipleTyping", { names: names.join(", ") });
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
          <p className="py-3 text-center text-sm text-zinc-500">{t("closedNotice")}</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-2">
            {(attachments.length > 0 || uploading > 0) && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <AttachmentPreview
                    key={`${a.url}-${i}`}
                    attachment={a}
                    onRemove={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
                {uploading > 0 ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-400 dark:border-zinc-700">
                    {t("uploading")}
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex items-end gap-2">
              <EmojiPicker onPick={insertEmoji} />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => onFilesChosen(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t("attachLabel")}
                className="rounded-lg px-2 py-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
                  <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <label htmlFor="chat-body" className="sr-only">
                {t("messageLabel")}
              </label>
              <textarea
                id="chat-body"
                ref={textareaRef}
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
                placeholder={t("writeMessage")}
                className="flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                type="submit"
                disabled={pending || uploading > 0 || (body.trim().length === 0 && attachments.length === 0)}
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
              >
                {pending ? t("sending") : t("send")}
              </button>
            </div>
          </form>
        )}

        <p className="mt-2 text-[11px] text-zinc-400">{connected ? t("connected") : t("offline")}</p>
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

/**
 * A sent attachment in the transcript. Images and short videos render inline;
 * anything else is a labelled link. Plain `<img>`/`<video>` (not `next/image`)
 * because the src is user content the send path has already constrained to our
 * own Cloudinary — there is nothing to optimise and no domain to allow-list.
 */
function Attachment({ attachment }: { attachment: ChatAttachment }) {
  const kind = attachmentKind(attachment);

  if (kind === "image") {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-64 max-w-[16rem] rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
        />
      </a>
    );
  }
  if (kind === "video") {
    return (
      <video
        src={attachment.url}
        controls
        className="max-h-64 max-w-[16rem] rounded-xl border border-zinc-200 dark:border-zinc-800"
      />
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-brand hover:underline dark:border-zinc-800 dark:text-brand"
    >
      📎 {attachment.name}
    </a>
  );
}

/** A staged attachment in the composer, with a control to drop it before send. */
function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove: () => void;
}) {
  const t = useTranslations("ThreadView");
  const kind = attachmentKind(attachment);
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
      ) : kind === "video" ? (
        <video src={attachment.url} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl">📎</div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("removeAttachment", { name: attachment.name })}
        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white transition hover:bg-black/80"
      >
        ✕
      </button>
    </div>
  );
}
