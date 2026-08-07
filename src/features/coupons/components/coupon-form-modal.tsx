"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Modal } from "@/shared/components/modal";
import { Select as StyledSelect } from "@/shared/components/select";
import { createCouponAction, updateCouponAction } from "../actions";
import type { CouponView, Option } from "../queries";

type FieldErrors = Record<string, string[] | undefined>;
type CouponType = "percentage" | "fixed" | "free_shipping";

/**
 * Create or edit a coupon.
 *
 * One component for both so the forms cannot drift; `initial` decides which
 * action runs. The visible fields follow the type — a free-shipping coupon has
 * no amount, and only a percentage can be capped — because a field that does
 * nothing for the chosen type is just a way to enter a value that gets ignored.
 */
export function CouponFormModal({
  open,
  onClose,
  vendorId,
  products,
  categories,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  vendorId: string;
  products: Option[];
  categories: Option[];
  /** Absent for a new coupon. */
  initial?: CouponView;
}) {
  const t = useTranslations("CouponForm");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [type, setType] = useState<CouponType>(initial?.type ?? "percentage");

  const editing = initial != null;
  const hasAmount = type !== "free_shipping";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const str = (k: string) => String(form.get(k) ?? "").trim();
    const num = (k: string) => {
      const raw = str(k);
      return raw === "" ? null : Number(raw);
    };
    const date = (k: string) => {
      const raw = str(k);
      return raw === "" ? null : raw;
    };

    const payload = {
      code: str("code"),
      description: str("description") || null,
      type,
      // A free-shipping coupon carries no amount; sending a stale one would only
      // confuse the validation, which forbids a positive value there.
      value: hasAmount ? (num("value") ?? 0) : 0,
      minSpend: num("minSpend") ?? 0,
      maxDiscount: type === "percentage" ? num("maxDiscount") : null,
      usageLimit: num("usageLimit"),
      perUserLimit: num("perUserLimit"),
      appliesToProducts: form.getAll("appliesToProducts").map(String).filter(Boolean),
      appliesToCategories: form.getAll("appliesToCategories").map(String).filter(Boolean),
      startsAt: date("startsAt"),
      expiresAt: date("expiresAt"),
      isActive: form.get("isActive") === "on",
    };

    startTransition(async () => {
      const result = editing
        ? await updateCouponAction(vendorId, initial.id, payload)
        : await createCouponAction(vendorId, payload);

      if (!result.ok) {
        setError(result.error.message);
        const details = result.error.details as { fieldErrors?: FieldErrors } | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
        return;
      }

      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t("editTitle") : t("newTitle")}
      description={editing ? initial.code : t("newDescription")}
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="code"
            label={t("code")}
            required
            defaultValue={initial?.code}
            hint={t("codeHint")}
            errors={fieldErrors["code"]}
            style={{ textTransform: "uppercase" }}
          />
          <Select
            name="type"
            label={t("type")}
            value={type}
            onChange={(v) => setType(v as CouponType)}
            options={[
              { value: "percentage", label: t("typePercentage") },
              { value: "fixed", label: t("typeFixed") },
              { value: "free_shipping", label: t("typeFreeShipping") },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {hasAmount && (
            <Field
              name="value"
              label={type === "percentage" ? t("percentage") : t("amountOff")}
              type="number"
              step={type === "percentage" ? "1" : "0.01"}
              min="0"
              required
              defaultValue={initial?.value}
              hint={type === "percentage" ? t("percentageHint") : undefined}
              errors={fieldErrors["value"]}
            />
          )}
          <Field
            name="minSpend"
            label={t("minimumSpend")}
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.minSpend || undefined}
            hint={t("minimumSpendHint")}
            errors={fieldErrors["minSpend"]}
          />
          {type === "percentage" && (
            <Field
              name="maxDiscount"
              label={t("maxDiscount")}
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial?.maxDiscount ?? undefined}
              hint={t("maxDiscountHint")}
              errors={fieldErrors["maxDiscount"]}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="usageLimit"
            label={t("totalUses")}
            type="number"
            step="1"
            min="1"
            defaultValue={initial?.usageLimit ?? undefined}
            hint={t("totalUsesHint")}
            errors={fieldErrors["usageLimit"]}
          />
          <Field
            name="perUserLimit"
            label={t("usesPerShopper")}
            type="number"
            step="1"
            min="1"
            defaultValue={initial?.perUserLimit ?? undefined}
            hint={t("usesPerShopperHint")}
            errors={fieldErrors["perUserLimit"]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="startsAt"
            label={t("starts")}
            type="date"
            defaultValue={initial?.startsAt ?? undefined}
            hint={t("startsHint")}
          />
          <Field
            name="expiresAt"
            label={t("ends")}
            type="date"
            defaultValue={initial?.expiresAt ?? undefined}
            hint={t("endsHint")}
            errors={fieldErrors["expiresAt"]}
          />
        </div>

        <Scope
          legend={t("limitToProducts")}
          name="appliesToProducts"
          options={products}
          selected={initial?.appliesToProducts ?? []}
          empty={t("noProductsYet")}
        />
        <Scope
          legend={t("limitToCategories")}
          name="appliesToCategories"
          options={categories}
          selected={initial?.appliesToCategories ?? []}
          empty={t("noCategoriesYet")}
        />
        <p className="-mt-2 text-xs text-zinc-500">{t("scopeHint")}</p>

        <Field
          name="description"
          label={t("description")}
          defaultValue={initial?.description}
          hint={t("descriptionHint")}
        />

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initial?.isActive ?? true}
            className="h-4 w-4 accent-brand"
          />
          {t("activeLabel")}
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
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
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
          >
            {pending ? t("saving") : editing ? t("saveChanges") : t("createCoupon")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Scope({
  legend,
  name,
  options,
  selected,
  empty,
}: {
  legend: string;
  name: string;
  options: Option[];
  selected: string[];
  empty: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{legend}</legend>
      {options.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">{empty}</p>
      ) : (
        <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {options.map((o) => (
            <label
              key={o.id}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-800"
            >
              <input
                type="checkbox"
                name={name}
                value={o.id}
                defaultChecked={selected.includes(o.id)}
                className="h-4 w-4 accent-brand"
              />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function Field({
  name,
  label,
  errors,
  hint,
  ...input
}: {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-brand focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        {...input}
      />
      {hint && !errors?.length && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {errors?.length ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

function Select({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <StyledSelect id={id} name={name} value={value} onChange={onChange} options={options} className="mt-1" />
    </div>
  );
}
