"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RevenuePoint } from "@/server/services/analytics.service";

// Matches --brand's light-mode value in globals.css. Recharts takes plain
// color strings, not CSS custom properties, so this can't reference the
// token directly — keep it in sync by hand if the brand color changes.
const ACCENT = "#b4512f";

/** Daily revenue area chart. Recharts is client-only, so this is a leaf client component. */
export function RevenueChart({ data, currency = "USD" }: { data: RevenuePoint[]; currency?: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-card border border-dashed border-border-default text-sm text-text-secondary">
        No revenue in this period yet.
      </div>
    );
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-subtle" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-text-tertiary"
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-text-tertiary"
            width={64}
            tickFormatter={fmt}
          />
          <Tooltip
            formatter={(value) => fmt(Number(value))}
            contentStyle={{ borderRadius: 8, border: "1px solid var(--border-default)", fontSize: 12 }}
          />
          <Area type="monotone" dataKey="revenue" stroke={ACCENT} strokeWidth={2} fill="url(#revenueFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
