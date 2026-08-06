import type { Metadata } from "next";
import { Link, redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/security/current-user";
import { getThread } from "@/features/messages/queries";
import { ThreadView } from "@/features/messages/components/thread-view";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = {
  title: "Conversation · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A thread from the staff side.
 *
 * Access is not decided here: `getThread` goes through the service guard, which
 * grants a vendor's staff every thread addressed to that vendor and a super
 * admin everything. Re-deriving that rule on the page would give it two
 * definitions and eventually two answers.
 */
export default async function DashboardThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const { id } = await params;

  const user = await requireUser().catch(() => null);
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(`/dashboard/messages/${id}`)}`, locale });

  let thread;
  try {
    // Staff are the answering side, so they get the resolve/close controls.
    thread = await getThread(user, id, { canModerate: true });
  } catch (err) {
    if (isAppError(err) && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-6">
      <Link href="/dashboard/messages" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
        ← Messages
      </Link>

      {thread.orderId ? (
        <Link
          href={`/dashboard/orders/${thread.orderId}`}
          className="ml-4 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          View related order
        </Link>
      ) : null}

      <div className="mt-4">
        <ThreadView thread={thread} viewerId={user.id} />
      </div>
    </main>
  );
}
