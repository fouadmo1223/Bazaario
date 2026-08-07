"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { requestReturnAction } from "../actions";

type ReturnRequest = {
  id: string;
  reason: string;
  note: string | null;
  status: "requested" | "approved" | "rejected";
  requestedAt: string;
  resolutionNote: string | null;
};

/**
 * Only one return request is meaningful at a time, so this renders either the
 * form (nothing pending or open yet) or the latest request's status — never
 * both. A rejected request doesn't block trying again with a different reason.
 */
export function ReturnRequestForm({ orderId, returns }: { orderId: string; returns: ReturnRequest[] }) {
  const t = useTranslations("ReturnRequest");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const latest = returns[returns.length - 1] ?? null;

  if (latest?.status === "requested") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("requestedWaiting", { reason: latest.reason })}
      </p>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestReturnAction(orderId, reason, note);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setReason("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div>
      {latest?.status === "rejected" && !open && (
        <p className="mb-2 text-sm text-zinc-500">
          {latest.resolutionNote
            ? t("previousDeclinedWithNote", { note: latest.resolutionNote })
            : t("previousDeclined")}
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {t("requestAReturn")}
        </button>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-3">
          <div>
            <label htmlFor="return-reason" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t("reason")}
            </label>
            <input
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor="return-note" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t("detailsOptional")}
            </label>
            <textarea
              id="return-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || !reason.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {pending ? t("sending") : t("submitRequest")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
