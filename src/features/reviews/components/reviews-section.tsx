"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
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
  const t = useTranslations("Reviews");
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
      setError(t("pickRating"));
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
    <section className="mt-14 border-t border-border-subtle pt-10">
      <h2 className="text-xl font-semibold text-foreground">
        {t("title")} {reviews.total > 0 ? <span className="text-text-tertiary">({reviews.total})</span> : null}
      </h2>

      {reviews.canWrite ? (
        <form onSubmit={submit} className="mt-6 rounded-2xl border border-border-subtle p-5">
          <p className="text-sm font-medium text-foreground">
            {editing ? t("updateYourReview") : t("writeReview")}
          </p>

          <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label={t("ratingLabel")}>
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
                  (hover || rating) >= n ? "text-amber-400" : "text-text-tertiary"
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
            placeholder={t("titlePlaceholder")}
            className="mt-3 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t("bodyPlaceholder")}
            className="mt-2 w-full resize-none rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
          />

          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {done && !error ? (
            <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{t("thanks")}</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? t("saving") : editing ? t("updateReview") : t("postReview")}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-text-tertiary">
          <Link
            href={`/login?next=${encodeURIComponent(`/v/${vendorSlug}/p/${productSlug}`)}`}
            className="text-brand hover:underline dark:text-brand"
          >
            {t("signIn")}
          </Link>
          {t("signInToWrite")}
        </p>
      )}

      <div className="mt-8 space-y-6">
        {reviews.items.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("noReviews")}</p>
        ) : (
          reviews.items.map((r) => (
            <article key={r.id} className="border-b border-border-subtle pb-6 last:border-0">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-sm font-medium text-foreground">{r.author}</span>
                {r.mine ? (
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-text-tertiary">
                    {t("you")}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-text-tertiary">
                  {new Date(r.createdAt).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
              {r.title ? (
                <p className="mt-2 text-sm font-semibold text-foreground">{r.title}</p>
              ) : null}
              {r.body ? (
                <p className="mt-1 text-sm whitespace-pre-wrap text-text-secondary">{r.body}</p>
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
        <span key={n} className={n <= value ? "text-amber-400" : "text-text-tertiary"}>
          ★
        </span>
      ))}
    </span>
  );
}
