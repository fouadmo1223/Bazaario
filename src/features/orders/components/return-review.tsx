"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { resolveReturnAction } from "../actions";

type ReturnRequest = {
  id: string;
  reason: string;
  note: string | null;
  status: "requested" | "approved" | "rejected";
  requestedAt: string;
  resolutionNote: string | null;
};

/** One pending return request, with approve/reject. Approving doesn't itself refund — that's a separate step via the existing refund form. */
export function ReturnReview({
  vendorId,
  orderId,
  request,
}: {
  vendorId: string;
  orderId: string;
  request: ReturnRequest;
}) {
  const t = useTranslations("ReturnReview");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resolve(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await resolveReturnAction(vendorId, orderId, request.id, decision, note.trim() || undefined);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border-subtle p-3">
      <p className="text-sm text-foreground">{request.reason}</p>
      {request.note && <p className="mt-0.5 text-xs text-text-tertiary">{request.note}</p>}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <label htmlFor="return-decline-note" className="block text-xs font-medium text-text-secondary">
            {t("declineReason")}
          </label>
          <input
            id="return-decline-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => resolve("rejected")}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? t("declining") : t("confirmDecline")}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              disabled={pending}
              className="text-sm text-text-tertiary hover:underline disabled:opacity-50"
            >
              {t("back")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => resolve("approved")}
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? t("approving") : t("approve")}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="rounded-lg border border-border-default px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-surface-raised disabled:opacity-50"
          >
            {t("decline")}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
