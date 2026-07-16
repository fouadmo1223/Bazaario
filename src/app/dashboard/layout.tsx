import Link from "next/link";
import { DashboardNav } from "@/features/dashboard/components/dashboard-nav";

/**
 * Dashboard shell. Deliberately does not resolve the vendor itself — each page
 * does that, so a permission failure surfaces on the page rather than blanking
 * the whole chrome.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Dashboard
          </Link>
          <DashboardNav />
        </div>
      </header>
      {children}
    </div>
  );
}
