"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitReviewAction } from "../actions";
import type { ProductReviews } from "../queries";

/**
 * Product reviews: the list, and a form for signed-in shoppers.
 *
 * The form is shown to any signed-in visitor, but the verified-purchase rule
 * lives in the service — so someone who has not bought the product sees the
 * form, tries once, and gets told why rather than having the control silently
 * missing. A guest is sent to sign in instead.
 */
export function ReviewsSection({
  productId,
  reviews,
  productSlug,
  vendorSlug,
}: {
  productId: string;
  reviews: ProductReviews;
  productSlug: string;
  vendorSlug: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(reviews.own?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState(reviews.own?.title ?? "");
  const [body, setBody] = useState(reviews.own?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const editing = reviews.own != null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating < 1) {
      setError("Pick a star rating.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitReviewAction({ productId, rating, title, body });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <section className="mt-14 border-t border-zinc-200 pt-10 dark:border-zinc-800">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Reviews {reviews.total > 0 ? <span className="text-zinc-400">({reviews.total})</span> : null}
      </h2>

      {reviews.canWrite ? (
        <form onSubmit={submit} className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {editing ? "Update your review" : "Write a review"}
          </p>

          <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                aria-pressed={rating === n}
                className={`text-2xl leading-none transition ${
                  (hover || rating) >= n ? "text-amber-400" : "text-zinc-300 dark:text-zinc-700"
                }`}
              >
                ★
              </button>
            ))}
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Title (optional)"
            className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Share what you thought…"
            className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />

          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {done && !error ? (
            <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Thanks for your review.</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : editing ? "Update review" : "Post review"}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">
          <Link
            href={`/login?next=${encodeURIComponent(`/v/${vendorSlug}/p/${productSlug}`)}`}
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Sign in
          </Link>{" "}
          to write a review.
        </p>
      )}

      <div className="mt-8 space-y-6">
        {reviews.items.length === 0 ? (
          <p className="text-sm text-zinc-500">No reviews yet — be the first.</p>
        ) : (
          reviews.items.map((r) => (
            <article key={r.id} className="border-b border-zinc-100 pb-6 last:border-0 dark:border-zinc-900">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{r.author}</span>
                {r.mine ? (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800">
                    You
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-zinc-400">
                  {new Date(r.createdAt).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
              {r.title ? (
                <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.title}</p>
              ) : null}
              {r.body ? (
                <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{r.body}</p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

/** Five stars filled to `value`, for a read-only display. */
function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} out of 5`} className="text-sm">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? "text-amber-400" : "text-zinc-300 dark:text-zinc-700"}>
          ★
        </span>
      ))}
    </span>
  );
}
