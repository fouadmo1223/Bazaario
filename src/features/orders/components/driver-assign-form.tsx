"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignDriverAction } from "../actions";

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [driverId, setDriverId] = useState(currentDriverId ?? "");
  const [error, setError] = useState<string | null>(null);

  if (drivers.length === 0) {
    return <p className="text-sm text-zinc-500">No delivery drivers on staff yet.</p>;
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
        <label htmlFor="driver-select" className="sr-only">
          Driver
        </label>
        <select
          id="driver-select"
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="" disabled>
            Choose a driver…
          </option>
          {drivers.map((d) => (
            <option key={d.userId} value={d.userId}>
              {d.name} ({d.email})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={assign}
          disabled={pending || !driverId || driverId === currentDriverId}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Assigning…" : currentDriverId ? "Reassign" : "Assign"}
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
