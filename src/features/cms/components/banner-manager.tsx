"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createBannerAction, updateBannerAction, deleteBannerAction } from "../actions";
import type { BannerView } from "../queries";

/** Add/edit/delete a vendor's storefront announcement banners. */
export function BannerManager({ vendorId, banners }: { vendorId: string; banners: BannerView[] }) {
  const t = useTranslations("BannerManager");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BannerView | null>(null);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-text-tertiary">{t("shown", { count: banners.length })}</p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md"
          >
            {t("newBanner")}
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-6 rounded-2xl border border-border-subtle p-4">
          <BannerForm vendorId={vendorId} onDone={() => setAdding(false)} />
        </div>
      )}

      {banners.length === 0 && !adding ? (
        <div className="rounded-2xl border border-dashed border-border-default p-12 text-center">
          <p className="text-sm text-text-tertiary">{t("noBanners")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {banners.map((b) =>
            editing?.id === b.id ? (
              <li key={b.id} className="rounded-2xl border border-border-subtle p-4">
                <BannerForm vendorId={vendorId} initial={b} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <BannerRow key={b.id} vendorId={vendorId} banner={b} onEdit={() => setEditing(b)} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function BannerRow({
  vendorId,
  banner,
  onEdit,
}: {
  vendorId: string;
  banner: BannerView;
  onEdit: () => void;
}) {
  const t = useTranslations("BannerManager");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBannerAction(vendorId, banner.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-2xl border border-border-subtle p-4 transition hover:border-border-default hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">{banner.message}</p>
          {banner.linkUrl && (
            <p className="mt-0.5 truncate text-xs text-text-tertiary">
              {banner.linkLabel || banner.linkUrl} → {banner.linkUrl}
            </p>
          )}
          <p className="mt-1 text-xs text-text-tertiary">{windowLabel(banner, t)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              banner.isActive
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-surface-raised text-text-secondary"
            }`}
          >
            {banner.isActive ? t("active") : t("off")}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-medium text-brand hover:underline dark:text-brand"
          >
            {t("edit")}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-xs text-text-tertiary hover:text-red-600 hover:underline disabled:opacity-50"
          >
            {pending ? t("deleting") : t("delete")}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

function windowLabel(b: BannerView, t: ReturnType<typeof useTranslations>): string {
  if (!b.startsAt && !b.endsAt) return t("alwaysShown");
  const from = b.startsAt ? new Date(b.startsAt).toLocaleDateString() : t("windowNow");
  const to = b.endsAt ? new Date(b.endsAt).toLocaleDateString() : t("windowNoEnd");
  return `${from} → ${to}`;
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function BannerForm({
  vendorId,
  initial,
  onDone,
}: {
  vendorId: string;
  initial?: BannerView;
  onDone: () => void;
}) {
  const t = useTranslations("BannerManager");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(initial?.message ?? "");
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(initial?.linkLabel ?? "");
  const [startsAt, setStartsAt] = useState(toDateInput(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(initial?.endsAt ?? null));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = { message, linkUrl, linkLabel, startsAt, endsAt, isActive };
    startTransition(async () => {
      const result = initial
        ? await updateBannerAction(vendorId, initial.id, input)
        : await createBannerAction(vendorId, input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div>
        <label htmlFor="banner-message" className="block text-sm font-medium text-text-secondary">
          {t("message")}
        </label>
        <input
          id="banner-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
          required
          placeholder={t("messagePlaceholder")}
          className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="banner-link-url" className="block text-sm font-medium text-text-secondary">
            {t("linkOptional")}
          </label>
          <input
            id="banner-link-url"
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="banner-link-label" className="block text-sm font-medium text-text-secondary">
            {t("linkTextOptional")}
          </label>
          <input
            id="banner-link-label"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            maxLength={40}
            placeholder={t("linkTextPlaceholder")}
            className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="banner-starts" className="block text-sm font-medium text-text-secondary">
            {t("startsOptional")}
          </label>
          <input
            id="banner-starts"
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="banner-ends" className="block text-sm font-medium text-text-secondary">
            {t("endsOptional")}
          </label>
          <input
            id="banner-ends"
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-border-default"
        />
        {t("activeLabel")}
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !message.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? t("saving") : initial ? t("saveChanges") : t("createBanner")}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="text-sm text-text-tertiary hover:underline disabled:opacity-50"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
