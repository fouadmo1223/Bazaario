import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/security/current-user";
import { getThread } from "@/features/messages/queries";
import { ThreadView } from "@/features/messages/components/thread-view";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = {
  title: "Conversation · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/messages/${id}`)}`);

  let thread;
  try {
    // Shoppers never moderate: closing their own complaint is almost always a
    // misclick, and it would let a thread disappear before it was answered.
    thread = await getThread(user, id, { canModerate: false });
  } catch (err) {
    // A thread that isn't theirs is reported as missing rather than forbidden —
    // "forbidden" confirms the id exists, which is itself a small leak.
    if (isAppError(err) && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <Link href="/account/messages" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
          ← Messages
        </Link>

        {thread.orderId ? (
          <Link
            href={`/account/orders/${thread.orderId}`}
            className="ml-4 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View related order
          </Link>
        ) : null}

        <div className="mt-4">
          <ThreadView thread={thread} viewerId={user.id} />
        </div>
      </div>
    </div>
  );
}
