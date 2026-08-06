"use client";

import { useState, useTransition } from "react";
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
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm text-zinc-900 dark:text-zinc-100">{request.reason}</p>
      {request.note && <p className="mt-0.5 text-xs text-zinc-500">{request.note}</p>}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <label htmlFor="return-decline-note" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Reason for declining (optional)
          </label>
          <input
            id="return-decline-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => resolve("rejected")}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "Declining…" : "Confirm decline"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              disabled={pending}
              className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
            >
              Back
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
            {pending ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Decline
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
