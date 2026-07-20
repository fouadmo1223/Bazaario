"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "../actions";

type FieldErrors = Record<string, string[] | undefined>;

/**
 * Name, phone and avatar.
 *
 * Email is shown but not editable: changing it is an identity change that needs
 * re-verification before the new address can receive password resets, and a
 * profile form that silently swaps a login is a way to lock someone out of
 * their own account. The action refuses it too, not just this input.
 *
 * The avatar is a URL rather than a file picker because there is no storage
 * integration yet. It previews with a plain `<img>`, not `next/image`: the
 * optimizer only accepts allow-listed hosts, so an arbitrary user-supplied URL
 * would 400 — and routing untrusted URLs through the optimizer is how it turns
 * into a proxy for probing internal addresses.
 */
export function ProfileForm({
  initial,
  email,
}: {
  initial: { name: string; phone: string; avatar: string };
  email: string;
}) {
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
        avatar: String(form.get("avatar") ?? "").trim(),
      });

      if (!result.ok) {
        setError(result.error.message);
        const details = result.error.details as { fieldErrors?: FieldErrors } | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
        return;
      }
      setMessage("Profile updated.");
      router.refresh();
    });
  }

  const field =
    "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
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

      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary host; see the note above. */}
        <img
          src={avatar || "/avatar-placeholder.svg"}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-full border border-zinc-200 object-cover dark:border-zinc-800"
          onError={(e) => {
            e.currentTarget.src = "/avatar-placeholder.svg";
          }}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor="avatar" className={label}>
            Avatar image URL
          </label>
          <input
            id="avatar"
            name="avatar"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://…"
            className={field}
          />
          {fieldErrors.avatar ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.avatar[0]}</p>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">
              Paste an https image link. File uploads need image storage, which isn&apos;t set up yet.
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="name" className={label}>
          Name
        </label>
        <input id="name" name="name" defaultValue={initial.name} required maxLength={120} className={field} />
        {fieldErrors.name ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="phone" className={label}>
          Phone <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <input id="phone" name="phone" defaultValue={initial.phone} maxLength={30} className={field} />
      </div>

      <div>
        <label htmlFor="email" className={label}>
          Email
        </label>
        <input
          id="email"
          value={email}
          readOnly
          disabled
          className={`${field} cursor-not-allowed opacity-60`}
        />
        <p className="mt-1 text-xs text-zinc-400">
          Your email is your sign-in and can&apos;t be changed here.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
