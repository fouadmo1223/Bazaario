"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Modal } from "@/shared/components/modal";
import { createCategoryAction, updateCategoryAction } from "../actions";
import type { CategoryView } from "../queries";

type FieldErrors = Record<string, string[] | undefined>;

/** Create or edit a vendor's category. One component for both, like the coupon form. */
export function CategoryFormModal({
  open,
  onClose,
  vendorId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  vendorId: string;
  /** Absent for a new category. */
  initial?: CategoryView;
}) {
  const t = useTranslations("CategoryForm");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const editing = initial != null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      nameAr: String(form.get("nameAr") ?? "").trim() || undefined,
      description: String(form.get("description") ?? "").trim() || null,
      image: String(form.get("image") ?? "").trim() || null,
      isActive: form.get("isActive") === "on",
    };

    startTransition(async () => {
      const result = editing
        ? await updateCategoryAction(vendorId, initial.id, payload)
        : await createCategoryAction(vendorId, payload);

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
      description={editing ? initial.name : t("newDescription")}
      size="md"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="name"
            label={t("name")}
            required
            defaultValue={initial?.name}
            errors={fieldErrors["name"]}
          />
          <Field
            name="nameAr"
            label={t("nameArLabel")}
            dir="rtl"
            defaultValue={initial?.nameAr}
            hint={t("nameArHint")}
          />
        </div>

        <Field
          name="description"
          label={t("description")}
          defaultValue={initial?.description}
          hint={t("descriptionHint")}
        />

        <Field
          name="image"
          label={t("image")}
          type="url"
          defaultValue={initial?.image ?? undefined}
          hint={t("imageHint")}
        />

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
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

        <div className="flex items-center justify-end gap-3 border-t border-border-subtle pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-sm text-text-tertiary hover:underline disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
          >
            {pending ? t("saving") : editing ? t("saveChanges") : t("createCategory")}
          </button>
        </div>
      </form>
    </Modal>
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
      <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
        {...input}
      />
      {hint && !errors?.length && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-text-tertiary">
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
