"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Modal } from "@/shared/components/modal";
import { Select as StyledSelect } from "@/shared/components/select";
import { createProductAction, updateProductAction } from "../actions";
import type { Option, ProductFormValues } from "../queries";

type FieldErrors = Record<string, string[] | undefined>;

/**
 * Create or edit a product.
 *
 * One component for both so the two forms cannot drift — an "edit" that offers
 * different fields from "add" is a reliable source of confusion. `initial`
 * decides which action runs.
 *
 * Variants are deliberately out of scope here: they are a separate editor
 * (`syncVariants`), and cramming an option matrix into this dialog would make
 * the common case — a simple product — worse for the sake of the rarer one.
 */
export function ProductFormModal({
  open,
  onClose,
  vendorId,
  categories,
  brands,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  vendorId: string;
  categories: Option[];
  brands: Option[];
  /** Absent for a new product. */
  initial?: ProductFormValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [type, setType] = useState<"simple" | "variable">(initial?.type ?? "simple");

  const editing = initial != null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const num = (k: string) => {
      const raw = String(form.get(k) ?? "").trim();
      return raw === "" ? undefined : Number(raw);
    };

    const mediaUrl = String(form.get("mediaUrl") ?? "").trim();

    const payload = {
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      shortDescription: String(form.get("shortDescription") ?? "").trim() || undefined,
      type,
      status: String(form.get("status") ?? "draft") as "draft" | "active" | "archived",
      // A variable product is priced by its variants; sending the parent's
      // number here would put a price on screen nobody can actually buy.
      price: type === "variable" ? 0 : (num("price") ?? 0),
      compareAtPrice: num("compareAtPrice") ?? null,
      stock: type === "variable" ? 0 : (num("stock") ?? 0),
      sku: String(form.get("sku") ?? "").trim() || undefined,
      barcode: String(form.get("barcode") ?? "").trim() || undefined,
      brand: String(form.get("brand") ?? "") || undefined,
      categories: form.getAll("categories").map(String).filter(Boolean),
      tags: String(form.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      featured: form.get("featured") === "on",
      trackInventory: form.get("trackInventory") === "on",
      allowBackorder: form.get("allowBackorder") === "on",
      ...(mediaUrl ? { media: [{ url: mediaUrl, type: "image" as const }] } : {}),
    };

    startTransition(async () => {
      const result = editing
        ? await updateProductAction(vendorId, initial.id, payload)
        : await createProductAction(vendorId, payload);

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
      title={editing ? "Edit product" : "New product"}
      description={editing ? initial.title : "Add a product to your catalogue"}
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field
          name="title"
          label="Title"
          required
          defaultValue={initial?.title}
          errors={fieldErrors["title"]}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="type"
            label="Type"
            value={type}
            onChange={(v) => setType(v as "simple" | "variable")}
            options={[
              { value: "simple", label: "Simple" },
              { value: "variable", label: "Variable (has options)" },
            ]}
            hint={type === "variable" ? "Price and stock come from its variants." : undefined}
          />
          <Select
            name="status"
            label="Status"
            defaultValue={initial?.status ?? "draft"}
            options={[
              { value: "draft", label: "Draft — not visible" },
              { value: "active", label: "Active — on sale" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>

        {/* Hidden for variable products: the variants own these numbers. */}
        {type === "simple" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              name="price"
              label="Price"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={initial?.price}
              errors={fieldErrors["price"]}
            />
            <Field
              name="compareAtPrice"
              label="Compare at"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial?.compareAtPrice ?? undefined}
              hint="Shown struck through"
            />
            <Field
              name="stock"
              label="Stock"
              type="number"
              step="1"
              min="0"
              defaultValue={initial?.stock}
              errors={fieldErrors["stock"]}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="brand"
            label="Brand"
            defaultValue={initial?.brand ?? ""}
            options={[{ value: "", label: "No brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
          />
          <Field name="sku" label="SKU" defaultValue={initial?.sku} />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Categories</legend>
          {categories.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              No categories yet — the product can still be saved without one.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {categories.map((c) => (
                <label
                  key={c.id}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-800"
                >
                  <input
                    type="checkbox"
                    name="categories"
                    value={c.id}
                    defaultChecked={initial?.categories.includes(c.id)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <Field
          name="shortDescription"
          label="Short description"
          defaultValue={initial?.shortDescription}
          hint="One line, shown above the fold"
        />

        <div>
          <label
            htmlFor="field-description"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Description
          </label>
          <textarea
            id="field-description"
            name="description"
            rows={4}
            defaultValue={initial?.description}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <Field
          name="mediaUrl"
          label="Image URL"
          type="url"
          defaultValue={initial?.media[0]?.url}
          hint="Uploads are not wired up yet — paste a URL for now"
          errors={fieldErrors["media"]}
        />

        <Field
          name="tags"
          label="Tags"
          defaultValue={initial?.tags.join(", ")}
          hint="Comma separated"
        />

        <div className="flex flex-wrap gap-4">
          <Check name="featured" label="Featured" defaultChecked={initial?.featured} />
          <Check
            name="trackInventory"
            label="Track inventory"
            defaultChecked={initial?.trackInventory ?? true}
          />
          <Check name="allowBackorder" label="Allow backorder" defaultChecked={initial?.allowBackorder} />
        </div>

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
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Create product"}
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
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
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
  hint,
  value,
  onChange,
  defaultValue,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  hint?: string;
  value?: string;
  onChange?: (v: string) => void;
  defaultValue?: string;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <StyledSelect
        id={id}
        name={name}
        options={options}
        className="mt-1"
        {...(onChange ? { value, onChange } : { defaultValue })}
      />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-indigo-600"
      />
      {label}
    </label>
  );
}
