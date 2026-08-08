import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/server/security/current-user";
import { listInbox } from "@/features/messages/queries";
import { ConversationList } from "@/features/messages/components/conversation-list";

type Search = { page?: string };

export const metadata: Metadata = {
  title: "Messages · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The shopper's inbox: their threads with stores and with platform support. */
export default async function AccountMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("AccountMessages");
  const user = await getCurrentUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent("/account/messages")}`, locale });

  const { page } = await searchParams;
  const inbox = await listInbox(user, { page });

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-text-tertiary">{t("count", { count: inbox.total })}</p>
          </div>

          <Link
            href="/account/messages/new"
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md"
          >
            {t("contactSupport")}
          </Link>
        </div>

        <ConversationList
          items={inbox.items}
          basePath="/account/messages"
          emptyMessage={t("emptyMessage")}
        />

        {inbox.totalPages > 1 ? (
          <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
            {inbox.page > 1 ? (
              <Link
                href={`/account/messages?page=${inbox.page - 1}`}
                className="rounded-lg border border-border-default px-3 py-1.5 text-sm"
              >
                {t("prev")}
              </Link>
            ) : null}
            <span className="text-sm text-text-tertiary">
              {t("pageOf", { page: inbox.page, totalPages: inbox.totalPages })}
            </span>
            {inbox.page < inbox.totalPages ? (
              <Link
                href={`/account/messages?page=${inbox.page + 1}`}
                className="rounded-lg border border-border-default px-3 py-1.5 text-sm"
              >
                {t("next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
