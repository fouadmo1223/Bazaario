import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission, requireUser } from "@/server/security/current-user";
import { listInbox } from "@/features/messages/queries";
import { ConversationList } from "@/features/messages/components/conversation-list";
import { PERMISSIONS, ROLES } from "@/shared/constants/rbac";
import type { ConversationStatus } from "@/server/database/models/conversation.model";
import { isAppError } from "@/shared/lib/errors";

type Search = { page?: string; status?: string; scope?: string };

export const metadata: Metadata = {
  title: "Messages · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUSES: ConversationStatus[] = ["open", "pending", "resolved", "closed"];

/**
 * The staff inbox.
 *
 * For vendor staff this is the vendor's *shared* inbox — every thread addressed
 * to the store, not just the ones this employee happens to be in. Super admins
 * additionally get `?scope=platform`, which drops the vendor filter and shows
 * every platform-level thread (support tickets and vendor escalations) instead.
 */
export default async function DashboardMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { page, status, scope } = await searchParams;

  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/login?next=${encodeURIComponent("/dashboard/messages")}`);

  const isSuperAdmin = user.roles.includes(ROLES.SUPER_ADMIN);
  const platformScope = isSuperAdmin && scope === "platform";

  const activeStatus = STATUSES.includes(status as ConversationStatus)
    ? (status as ConversationStatus)
    : undefined;

  let vendorId: string | undefined;
  let vendorName: string | null = null;

  if (!platformScope) {
    // Auth resolves here, before anything streams — a redirect thrown after a
    // Suspense shell flushes cannot set a status line, and the visitor is
    // stranded on the fallback.
    try {
      const { vendor } = await resolveActiveVendor();
      await requireVendorPermission(String(vendor._id), PERMISSIONS.TICKET_RESPOND);
      vendorId = String(vendor._id);
      vendorName = vendor.name;
    } catch (err) {
      if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
        redirect(`/login?next=${encodeURIComponent("/dashboard/messages")}`);
      }
      throw err;
    }
  }

  const inbox = await listInbox(
    user,
    { page },
    { vendorId, status: activeStatus, platform: platformScope },
  );

  const href = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    if (scope) search.set("scope", scope);
    if (activeStatus) search.set("status", activeStatus);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) search.delete(k);
      else search.set(k, v);
    }
    const qs = search.toString();
    return qs ? `/dashboard/messages?${qs}` : "/dashboard/messages";
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Messages
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {platformScope ? "Platform-wide" : vendorName}
            {" · "}
            {inbox.total} {inbox.total === 1 ? "conversation" : "conversations"}
          </p>
        </div>

        {isSuperAdmin ? (
          <div className="flex items-center gap-2">
            <Link
              href={platformScope ? href({ scope: undefined }) : "/dashboard/messages"}
              aria-current={!platformScope ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                !platformScope
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-500"
              }`}
            >
              This store
            </Link>
            <Link
              href={href({ scope: "platform" })}
              aria-current={platformScope ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                platformScope
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-500"
              }`}
            >
              Platform
            </Link>
          </div>
        ) : null}
      </div>

      <nav aria-label="Filter by status" className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          href={href({ status: undefined, page: undefined })}
          aria-current={!activeStatus ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !activeStatus
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          All
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={href({ status: s, page: undefined })}
            aria-current={activeStatus === s ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              activeStatus === s
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {s}
          </Link>
        ))}
      </nav>

      <ConversationList
        items={inbox.items}
        basePath="/dashboard/messages"
        emptyMessage="No conversations here."
      />

      {inbox.totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
          {inbox.page > 1 ? (
            <Link
              href={href({ page: String(inbox.page - 1) })}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-sm text-zinc-500">
            Page {inbox.page} of {inbox.totalPages}
          </span>
          {inbox.page < inbox.totalPages ? (
            <Link
              href={href({ page: String(inbox.page + 1) })}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
