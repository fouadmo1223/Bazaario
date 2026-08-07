"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Modal } from "@/shared/components/modal";
import { syncVariantsAction } from "../actions";
import type { VariantEditorData, VariantEditorRow } from "../queries";

/**
 * The variant matrix editor.
 *
 * A variable product is two things a vendor has to keep in sync by hand
 * otherwise: the *options* it comes in (Size, Colour…) and the concrete
 * combinations that are actually stocked. This editor derives the second from
 * the first — every combination of the option values is a candidate row — and
 * lets the vendor switch a combination on or off rather than expecting them to
 * type out a grid that may not be fully populated. A shoe in five sizes and
 * three colours has fifteen cells but perhaps only ten real SKUs; the seed data
 * is exactly that shape, and the storefront picker already disables the gaps.
 *
 * Options and variants save together (`syncVariantsAction`): a variant's
 * `options` are meaningless without the attributes that name them.
 */

const MAX_CELLS = 200;
const KEY_SEP = ""; // control char (US): never appears in an option name/value

type RowState = {
  enabled: boolean;
  sku: string;
  price: string;
  compareAt: string;
  stock: string;
  active: boolean;
  /** Carried through untouched — there is no per-variant image field here yet. */
  image: string | null;
};

type AttrDraft = { name: string; valuesText: string };

/** Order-independent identity for a combination, so edits survive reordering. */
function comboKey(names: string[], options: Record<string, string>): string {
  return names
    .map((n) => `${n}=${options[n] ?? ""}`)
    .sort()
    .join(KEY_SEP);
}

function parseValues(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const v = raw.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Cartesian product of each attribute's values, in attribute order. */
function cartesian(attrs: { name: string; values: string[] }[]): Record<string, string>[] {
  return attrs.reduce<Record<string, string>[]>(
    (acc, attr) =>
      acc.flatMap((combo) => attr.values.map((value) => ({ ...combo, [attr.name]: value }))),
    [{}],
  );
}

function rowFromVariant(v: VariantEditorRow): RowState {
  return {
    enabled: true,
    sku: v.sku,
    price: String(v.price),
    compareAt: v.compareAtPrice == null ? "" : String(v.compareAtPrice),
    stock: String(v.stock),
    active: v.isActive,
    image: v.image,
  };
}

const BLANK_ROW: RowState = {
  enabled: false,
  sku: "",
  price: "",
  compareAt: "",
  stock: "0",
  active: true,
  image: null,
};

export function VariantMatrixModal({
  open,
  onClose,
  vendorId,
  data,
}: {
  open: boolean;
  onClose: () => void;
  vendorId: string;
  data: VariantEditorData;
}) {
  const t = useTranslations("ProductVariants");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attrs, setAttrs] = useState<AttrDraft[]>(() =>
    data.attributes.length
      ? data.attributes.map((a) => ({ name: a.name, valuesText: a.values.join(", ") }))
      : [{ name: "", valuesText: "" }],
  );

  // Per-combination edits, keyed by comboKey. Seeded from the saved variants so
  // reopening the editor shows exactly what is stored.
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const names = data.attributes.map((a) => a.name);
    const seed: Record<string, RowState> = {};
    for (const v of data.variants) seed[comboKey(names, v.options)] = rowFromVariant(v);
    return seed;
  });

  const [skuPrefix, setSkuPrefix] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");

  // Clean option definitions: named attributes with at least one value.
  const parsedAttrs = useMemo(
    () =>
      attrs
        .map((a) => ({ name: a.name.trim(), values: parseValues(a.valuesText) }))
        .filter((a) => a.name && a.values.length > 0),
    [attrs],
  );

  const names = useMemo(() => parsedAttrs.map((a) => a.name), [parsedAttrs]);
  const combos = useMemo(() => (parsedAttrs.length ? cartesian(parsedAttrs) : []), [parsedAttrs]);
  const tooMany = combos.length > MAX_CELLS;

  const rowFor = (key: string): RowState => rows[key] ?? BLANK_ROW;

  function setRow(key: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [key]: { ...(prev[key] ?? BLANK_ROW), ...patch } }));
  }

  function setAllEnabled(enabled: boolean) {
    setRows((prev) => {
      const next = { ...prev };
      for (const combo of combos) {
        const key = comboKey(names, combo);
        next[key] = { ...(next[key] ?? BLANK_ROW), enabled };
      }
      return next;
    });
  }

  /** Fill blank SKUs on enabled rows as PREFIX-VALUE-VALUE, sanitized. */
  function generateSkus() {
    const prefix = skuPrefix.trim().toUpperCase().replace(/\s+/g, "-");
    setRows((prev) => {
      const next = { ...prev };
      for (const combo of combos) {
        const key = comboKey(names, combo);
        const row = next[key] ?? BLANK_ROW;
        if (!row.enabled || row.sku.trim()) continue;
        const tail = names
          .map((n) => combo[n])
          .join("-")
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-");
        next[key] = { ...row, sku: [prefix, tail].filter(Boolean).join("-") };
      }
      return next;
    });
  }

  /** Apply a single price to every enabled row. */
  function applyBulkPrice() {
    const price = bulkPrice.trim();
    if (price === "") return;
    setRows((prev) => {
      const next = { ...prev };
      for (const combo of combos) {
        const key = comboKey(names, combo);
        const row = next[key] ?? BLANK_ROW;
        if (row.enabled) next[key] = { ...row, price };
      }
      return next;
    });
  }

  function updateAttr(i: number, patch: Partial<AttrDraft>) {
    setAttrs((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  function addAttr() {
    setAttrs((prev) => [...prev, { name: "", valuesText: "" }]);
  }

  function removeAttr(i: number) {
    setAttrs((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  const enabledCombos = combos.filter((c) => rowFor(comboKey(names, c)).enabled);

  function onSave() {
    setError(null);

    if (parsedAttrs.length === 0) {
      setError(t("errorNoOptions"));
      return;
    }
    if (tooMany) {
      setError(t("errorTooMany", { count: combos.length }));
      return;
    }

    const variants = [];
    const seenSku = new Set<string>();
    for (const combo of combos) {
      const key = comboKey(names, combo);
      const row = rowFor(key);
      if (!row.enabled) continue;

      const sku = row.sku.trim();
      if (!sku) {
        setError(t("errorMissingSku"));
        return;
      }
      const lower = sku.toLowerCase();
      if (seenSku.has(lower)) {
        setError(t("errorDuplicateSku", { sku }));
        return;
      }
      seenSku.add(lower);

      const price = Number(row.price);
      if (!Number.isFinite(price) || price < 0) {
        setError(t("errorInvalidPrice", { sku }));
        return;
      }
      const compareAt = row.compareAt.trim() === "" ? null : Number(row.compareAt);
      const stock = Number(row.stock) || 0;

      variants.push({
        options: combo,
        sku,
        price,
        compareAtPrice: compareAt,
        stock,
        isActive: row.active,
        ...(row.image ? { image: row.image } : {}),
      });
    }

    const attributes = parsedAttrs.map((a) => ({
      name: a.name,
      values: a.values,
      variantDefining: true,
    }));

    setPending(true);
    void syncVariantsAction(vendorId, data.productId, { attributes, variants })
      .then((result) => {
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        onClose();
        router.refresh();
      })
      .finally(() => setPending(false));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      description={data.title}
      size="lg"
    >
      <div className="space-y-6">
        {/* Options */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("optionsHeading")}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{t("optionsHint")}</p>

          <div className="mt-3 space-y-3">
            {attrs.map((attr, i) => (
              <div key={i} className="flex items-start gap-2">
                <input
                  aria-label={t("optionName", { n: i + 1 })}
                  placeholder={t("optionNamePlaceholder")}
                  value={attr.name}
                  onChange={(e) => updateAttr(i, { name: e.target.value })}
                  className="w-32 shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                />
                <input
                  aria-label={t("optionValues", { n: i + 1 })}
                  placeholder={t("optionValuesPlaceholder")}
                  value={attr.valuesText}
                  onChange={(e) => updateAttr(i, { valuesText: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                />
                <button
                  type="button"
                  onClick={() => removeAttr(i)}
                  disabled={attrs.length === 1}
                  aria-label={t("removeOption", { n: i + 1 })}
                  className="shrink-0 rounded-lg px-2.5 py-2 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-zinc-800"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addAttr}
            className="mt-3 text-xs font-medium text-brand hover:underline dark:text-brand"
          >
            {t("addOption")}
          </button>
        </section>

        {/* Matrix */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {t("variantsHeading")}
              <span className="ml-2 font-normal text-zinc-500">
                {t("enabledOfTotal", { enabled: enabledCombos.length, total: combos.length })}
              </span>
            </h3>
            {combos.length > 0 && !tooMany && (
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => setAllEnabled(true)} className="text-brand hover:underline dark:text-brand">
                  {t("enableAll")}
                </button>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <button type="button" onClick={() => setAllEnabled(false)} className="text-zinc-500 hover:underline">
                  {t("disableAll")}
                </button>
              </div>
            )}
          </div>

          {combos.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
              {t("defineOptionPrompt")}
            </p>
          ) : tooMany ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {t("tooManyCombos", { count: combos.length, max: MAX_CELLS })}
            </p>
          ) : (
            <>
              {/* Bulk helpers — a fifteen-cell grid is tedious without them. */}
              <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-zinc-500">{t("skuPrefix")}</span>
                    <input
                      value={skuPrefix}
                      onChange={(e) => setSkuPrefix(e.target.value)}
                      placeholder="TEE"
                      className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1.5 focus:border-brand focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                  <button type="button" onClick={generateSkus} className="rounded-md border border-zinc-300 px-2.5 py-1.5 font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    {t("generateSkus")}
                  </button>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-zinc-500">{t("setPrice")}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={bulkPrice}
                      onChange={(e) => setBulkPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1.5 focus:border-brand focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                  <button type="button" onClick={applyBulkPrice} className="rounded-md border border-zinc-300 px-2.5 py-1.5 font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    {t("applyToEnabled")}
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("colOn")}</th>
                      {names.map((n) => (
                        <th key={n} className="px-3 py-2 font-medium">{n}</th>
                      ))}
                      <th className="px-3 py-2 font-medium">{t("colSku")}</th>
                      <th className="px-3 py-2 font-medium">{t("colPrice")}</th>
                      <th className="px-3 py-2 font-medium">{t("colCompareAt")}</th>
                      <th className="px-3 py-2 font-medium">{t("colStock")}</th>
                      <th className="px-3 py-2 font-medium">{t("colActive")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combos.map((combo) => {
                      const key = comboKey(names, combo);
                      const row = rowFor(key);
                      const off = !row.enabled;
                      return (
                        <tr key={key} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(e) => setRow(key, { enabled: e.target.checked })}
                              aria-label={t("enableCombo", { combo: names.map((n) => combo[n]).join(" / ") })}
                              className="h-4 w-4 accent-brand"
                            />
                          </td>
                          {names.map((n) => (
                            <td key={n} className={`px-3 py-2 whitespace-nowrap ${off ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-700 dark:text-zinc-300"}`}>
                              {combo[n]}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <input
                              value={row.sku}
                              disabled={off}
                              onChange={(e) => setRow(key, { sku: e.target.value })}
                              aria-label={t("skuForCombo", { combo: names.map((n) => combo[n]).join(" / ") })}
                              className="w-32 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:disabled:bg-zinc-900"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.price}
                              disabled={off}
                              onChange={(e) => setRow(key, { price: e.target.value })}
                              aria-label={t("priceForCombo", { combo: names.map((n) => combo[n]).join(" / ") })}
                              className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-brand focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:disabled:bg-zinc-900"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.compareAt}
                              disabled={off}
                              onChange={(e) => setRow(key, { compareAt: e.target.value })}
                              aria-label={t("compareAtForCombo", { combo: names.map((n) => combo[n]).join(" / ") })}
                              className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-brand focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:disabled:bg-zinc-900"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.stock}
                              disabled={off}
                              onChange={(e) => setRow(key, { stock: e.target.value })}
                              aria-label={t("stockForCombo", { combo: names.map((n) => combo[n]).join(" / ") })}
                              className="w-16 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-brand focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:disabled:bg-zinc-900"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={row.active}
                              disabled={off}
                              onChange={(e) => setRow(key, { active: e.target.checked })}
                              aria-label={t("activeForCombo", { combo: names.map((n) => combo[n]).join(" / ") })}
                              className="h-4 w-4 accent-brand disabled:opacity-40"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-zinc-500">{t("onActiveHint")}</p>
            </>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? t("saving") : t("saveVariants")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
