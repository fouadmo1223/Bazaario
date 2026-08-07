"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { assignDriverAction } from "../actions";
import { Select } from "@/shared/components/select";

export function DriverAssignForm({
  vendorId,
  orderId,
  drivers,
  currentDriverId,
}: {
  vendorId: string;
  orderId: string;
  drivers: { userId: string; name: string; email: string }[];
  currentDriverId: string | null;
}) {
  const t = useTranslations("DriverAssignForm");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [driverId, setDriverId] = useState(currentDriverId ?? "");
  const [error, setError] = useState<string | null>(null);

  if (drivers.length === 0) {
    return <p className="text-sm text-zinc-500">{t("noDrivers")}</p>;
  }

  function assign() {
    if (!driverId) return;
    setError(null);
    startTransition(async () => {
      const result = await assignDriverAction(vendorId, orderId, driverId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Select
          id="driver-select"
          aria-label={t("driverLabel")}
          value={driverId}
          onChange={setDriverId}
          placeholder={t("chooseDriver")}
          className="w-64"
          options={drivers.map((d) => ({ value: d.userId, label: `${d.name} (${d.email})` }))}
        />
        <button
          type="button"
          onClick={assign}
          disabled={pending || !driverId || driverId === currentDriverId}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? t("assigning") : currentDriverId ? t("reassign") : t("assign")}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
