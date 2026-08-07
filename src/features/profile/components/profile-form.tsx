"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateProfileAction } from "../actions";
import { AvatarUpload } from "./avatar-upload";

type FieldErrors = Record<string, string[] | undefined>;

/**
 * Name, phone and avatar.
 *
 * Email is shown but not editable: changing it is an identity change that needs
 * re-verification before the new address can receive password resets, and a
 * profile form that silently swaps a login is a way to lock someone out of
 * their own account. The action refuses it too, not just this input.
 *
 * The avatar is handled by `AvatarUpload`, which uploads to Cloudinary and
 * saves the result itself. This form keeps the URL in state only so the preview
 * stays current; submitting sends it back unchanged.
 */
export function ProfileForm({
  initial,
  email,
}: {
  initial: { name: string; phone: string; avatar: string };
  email: string;
}) {
  const t = useTranslations("Account");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [avatar, setAvatar] = useState(initial.avatar);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateProfileAction({
        name: String(form.get("name") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim(),
        // From component state, not the form: the file input holds a file, and
        // the uploaded URL never lives in a form field.
        avatar,
      });

      if (!result.ok) {
        setError(result.error.message);
        const details = result.error.details as { fieldErrors?: FieldErrors } | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
        return;
      }
      setMessage(t("profileUpdated"));
      router.refresh();
    });
  }

  const field =
    "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const label = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {message}
        </p>
      ) : null}

      <div>
        <span className={label}>{t("photo")}</span>
        <div className="mt-2">
          <AvatarUpload value={avatar} onChange={setAvatar} disabled={pending} />
        </div>
        {fieldErrors.avatar ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.avatar[0]}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="name" className={label}>
          {t("name")}
        </label>
        <input id="name" name="name" defaultValue={initial.name} required maxLength={120} className={field} />
        {fieldErrors.name ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="phone" className={label}>
          {t("phone")} <span className="font-normal text-zinc-400">{t("optional")}</span>
        </label>
        <input id="phone" name="phone" defaultValue={initial.phone} maxLength={30} className={field} />
      </div>

      <div>
        <label htmlFor="email" className={label}>
          {t("email")}
        </label>
        <input
          id="email"
          value={email}
          readOnly
          disabled
          className={`${field} cursor-not-allowed opacity-60`}
        />
        <p className="mt-1 text-xs text-zinc-400">{t("emailHint")}</p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
      >
        {pending ? t("saving") : t("saveChanges")}
      </button>
    </form>
  );
}
