"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { startConversationAction } from "../actions";
import type { ConversationKind } from "@/server/database/models/conversation.model";

/**
 * Open a new thread.
 *
 * The `kind` and target are fixed by whichever screen renders this — a shopper
 * on a store page can only produce a `customer_vendor` thread with that vendor.
 * They are still re-validated server-side; passing them as props is a
 * convenience for the UI, never the authorization.
 */
export function NewConversationForm({
  kind,
  vendorId,
  withUserId,
  orderId,
  productId,
  basePath,
  defaultSubject = "",
  submitLabel,
}: {
  kind: ConversationKind;
  vendorId?: string;
  withUserId?: string;
  orderId?: string;
  productId?: string;
  /** Where to navigate once the thread exists, e.g. `/account/messages`. */
  basePath: string;
  defaultSubject?: string;
  submitLabel?: string;
}) {
  const t = useTranslations("NewConversationForm");
  const router = useRouter();
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || body.trim().length === 0) return;
    setError(null);

    startTransition(async () => {
      const result = await startConversationAction({
        kind,
        vendorId: vendorId ?? null,
        withUserId: withUserId ?? null,
        subject: subject.trim() || null,
        orderId: orderId ?? null,
        productId: productId ?? null,
        body: body.trim(),
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`${basePath}/${result.data.conversationId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="subject" className="block text-sm font-medium text-text-secondary">
          {t("subject")} <span className="font-normal text-text-tertiary">{t("optional")}</span>
        </label>
        <input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder={t("subjectPlaceholder")}
          className="mt-1 w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand"
        />
      </div>

      <div>
        <label htmlFor="body" className="block text-sm font-medium text-text-secondary">
          {t("message")}
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          required
          maxLength={5000}
          placeholder={t("bodyPlaceholder")}
          className="mt-1 w-full resize-y rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand"
        />
      </div>

      <button
        type="submit"
        disabled={pending || body.trim().length === 0}
        className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
      >
        {pending ? t("sending") : (submitLabel ?? t("sendMessage"))}
      </button>
    </form>
  );
}
