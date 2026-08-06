"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  addAddressAction,
  updateAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
} from "../actions";
import type { AddressRow } from "../queries";

type FieldErrors = Record<string, string[] | undefined>;

const EMPTY: AddressRow = {
  id: "",
  label: "Home",
  recipient: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  isDefault: false,
};

/**
 * Saved delivery addresses.
 *
 * Field ids are prefixed `addr-` because this form renders on the same page as
 * the profile form, which also has a `phone`. Duplicate ids are not merely
 * untidy: `<label for="phone">` binds to the *first* match in the document, so
 * clicking this form's phone label focused the profile's input instead.
 *
 * One form serves add and edit so the two cannot drift — an "edit" offering
 * different fields from "add" is a reliable source of confusion. Which one runs
 * is decided by whether an existing row is being edited.
 *
 * Deletion asks first. It is the only irreversible control on the page, and it
 * sits next to "Set default", which is not.
 */
export function AddressBook({ addresses }: { addresses: AddressRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<AddressRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  function close() {
    setEditing(null);
    setError(null);
    setFieldErrors({});
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const values = {
      label: String(form.get("label") ?? "").trim() || "Home",
      recipient: String(form.get("recipient") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      line1: String(form.get("line1") ?? "").trim(),
      line2: String(form.get("line2") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      region: String(form.get("region") ?? "").trim(),
      postalCode: String(form.get("postalCode") ?? "").trim(),
      country: String(form.get("country") ?? "").trim(),
      isDefault: form.get("isDefault") === "on",
    };

    startTransition(async () => {
      const result = editing.id
        ? await updateAddressAction({ ...values, addressId: editing.id })
        : await addAddressAction(values);

      if (!result.ok) {
        setError(result.error.message);
        const details = result.error.details as { fieldErrors?: FieldErrors } | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
        return;
      }
      close();
      router.refresh();
    });
  }

  function run(action: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return;
      setConfirmingDelete(null);
      router.refresh();
    });
  }

  const field =
    "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const label = "block text-xs font-medium text-zinc-600 dark:text-zinc-400";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Addresses</h2>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(EMPTY)}
            className="rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Add address
          </button>
        ) : null}
      </div>

      {editing ? (
        <form
          onSubmit={onSubmit}
          className="mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
        >
          {error ? (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="addr-label" className={label}>Label</label>
              <input id="addr-label" name="label" defaultValue={editing.label} className={field} />
            </div>
            <div>
              <label htmlFor="addr-recipient" className={label}>Recipient</label>
              <input id="addr-recipient" name="recipient" defaultValue={editing.recipient} required className={field} />
              {fieldErrors.recipient ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.recipient[0]}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="addr-phone" className={label}>Phone</label>
              <input id="addr-phone" name="phone" defaultValue={editing.phone} required className={field} />
              {fieldErrors.phone ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.phone[0]}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="addr-country" className={label}>Country</label>
              <input id="addr-country" name="country" defaultValue={editing.country} required className={field} />
              {fieldErrors.country ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.country[0]}</p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="addr-line1" className={label}>Address line 1</label>
              <input id="addr-line1" name="line1" defaultValue={editing.line1} required className={field} />
              {fieldErrors.line1 ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.line1[0]}</p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="addr-line2" className={label}>Address line 2 (optional)</label>
              <input id="addr-line2" name="line2" defaultValue={editing.line2 ?? ""} className={field} />
            </div>
            <div>
              <label htmlFor="addr-city" className={label}>City</label>
              <input id="addr-city" name="city" defaultValue={editing.city} required className={field} />
              {fieldErrors.city ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.city[0]}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="addr-region" className={label}>Region (optional)</label>
              <input id="addr-region" name="region" defaultValue={editing.region ?? ""} className={field} />
            </div>
            <div>
              <label htmlFor="addr-postalCode" className={label}>Postal code (optional)</label>
              <input id="addr-postalCode" name="postalCode" defaultValue={editing.postalCode ?? ""} className={field} />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={editing.isDefault}
              className="h-4 w-4 accent-indigo-600"
            />
            Use as my default delivery address
          </label>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {pending ? "Saving…" : editing.id ? "Save address" : "Add address"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {addresses.length === 0 && !editing ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 py-10 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">No saved addresses yet.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {address.label}
                    </span>
                    {address.isDefault ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {address.recipient} · {address.phone}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {[address.line1, address.line2, address.city, address.region, address.postalCode, address.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!address.isDefault ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setDefaultAddressAction({ addressId: address.id }))}
                      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Set default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setEditing(address)}
                    className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Edit
                  </button>

                  {confirmingDelete === address.id ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => deleteAddressAction({ addressId: address.id }))}
                        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(null)}
                        className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(address.id)}
                      className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
