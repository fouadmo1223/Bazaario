"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrderAction } from "../actions";
import { formatMoney } from "@/shared/lib/format";

export type ShippingOption = {
  id: string;
  label: string;
  description: string;
  quotedFee: number;
};

export type PaymentOption = {
  id: "stripe" | "paymob" | "cod";
  label: string;
  description: string;
};

type FieldErrors = Record<string, string[] | undefined>;

/**
 * Checkout form. Every price shown here is one the server quoted; the form
 * submits a shipping method id and a payment provider, never an amount.
 */
export function CheckoutForm({
  vendorId,
  vendorSlug,
  currency,
  shippingOptions,
  paymentOptions,
  isAuthenticated,
}: {
  vendorId: string;
  vendorSlug: string;
  currency: string;
  shippingOptions: ShippingOption[];
  paymentOptions: PaymentOption[];
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [shippingMethod, setShippingMethod] = useState(shippingOptions[0]?.id ?? "standard");
  const [paymentProvider, setPaymentProvider] = useState(paymentOptions[0]?.id ?? "cod");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const payload = {
      address: {
        recipient: String(form.get("recipient") ?? ""),
        phone: String(form.get("phone") ?? ""),
        line1: String(form.get("line1") ?? ""),
        line2: String(form.get("line2") ?? ""),
        city: String(form.get("city") ?? ""),
        region: String(form.get("region") ?? ""),
        postalCode: String(form.get("postalCode") ?? ""),
        country: String(form.get("country") ?? ""),
      },
      shippingMethod,
      paymentProvider,
      guestEmail: String(form.get("guestEmail") ?? ""),
    };

    startTransition(async () => {
      const result = await placeOrderAction(vendorId, vendorSlug, payload);

      if (!result.ok) {
        setError(result.error.message);
        const details = result.error.details as
          | { fieldErrors?: FieldErrors }
          | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
        return;
      }

      // Hosted payment flows leave the app; COD lands on the confirmation.
      if (result.data.redirectUrl) {
        window.location.assign(result.data.redirectUrl);
        return;
      }
      router.push(result.data.confirmationUrl);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {!isAuthenticated && (
        <Section title="Contact">
          <Field
            name="guestEmail"
            label="Email"
            type="email"
            autoComplete="email"
            required
            errors={fieldErrors["guestEmail"]}
            hint="Your receipt and order updates go here."
          />
        </Section>
      )}

      <Section title="Delivery address">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field name="recipient" label="Full name" autoComplete="name" required className="sm:col-span-2" />
          <Field name="phone" label="Phone" type="tel" autoComplete="tel" required />
          <Field name="country" label="Country code" autoComplete="country" required placeholder="EG" maxLength={2} />
          <Field name="line1" label="Address" autoComplete="address-line1" required className="sm:col-span-2" />
          <Field name="line2" label="Apartment, suite (optional)" autoComplete="address-line2" className="sm:col-span-2" />
          <Field name="city" label="City" autoComplete="address-level2" required />
          <Field name="region" label="Region (optional)" autoComplete="address-level1" />
          <Field name="postalCode" label="Postal code (optional)" autoComplete="postal-code" />
        </div>
      </Section>

      <Section title="Shipping method">
        <fieldset className="space-y-2">
          <legend className="sr-only">Shipping method</legend>
          {shippingOptions.map((option) => (
            <Choice
              key={option.id}
              name="shipping"
              value={option.id}
              checked={shippingMethod === option.id}
              onChange={() => setShippingMethod(option.id)}
              label={option.label}
              description={option.description}
              trailing={option.quotedFee > 0 ? formatMoney(option.quotedFee, currency) : "Free"}
            />
          ))}
        </fieldset>
      </Section>

      <Section title="Payment">
        <fieldset className="space-y-2">
          <legend className="sr-only">Payment method</legend>
          {paymentOptions.map((option) => (
            <Choice
              key={option.id}
              name="payment"
              value={option.id}
              checked={paymentProvider === option.id}
              onChange={() => setPaymentProvider(option.id)}
              label={option.label}
              description={option.description}
            />
          ))}
        </fieldset>
      </Section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  name,
  label,
  errors,
  hint,
  className,
  ...input
}: {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  const describedBy = errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy}
        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
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

function Choice({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  trailing,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
  trailing?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
        checked
          ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30"
          : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-indigo-600"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className="block text-xs text-zinc-500">{description}</span>
      </span>
      {trailing && (
        <span className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {trailing}
        </span>
      )}
    </label>
  );
}
