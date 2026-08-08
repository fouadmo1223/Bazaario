import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { catalogService } from "@/server/services/catalog.service";
import { Reveal } from "@/shared/components/reveal";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { localized } from "@/shared/lib/localized";
import type { Locale } from "@/i18n/locales";

export const metadata: Metadata = {
  title: "Categories · Bazaario",
  description: "Browse the marketplace by category.",
  alternates: { canonical: "/categories" },
};

export const revalidate = 300;

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Categories");
  const categories = await catalogService.categories();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("count", { count: categories.length })}</p>
      </header>

      {categories.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-default p-16 text-center">
          <p className="text-sm text-text-secondary">{t("empty")}</p>
        </div>
      ) : (
        <Reveal as="ul" stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className="group block overflow-hidden rounded-card border border-border-subtle transition hover:-translate-y-0.5 hover:border-brand hover:shadow-sm"
              >
                <div className="relative aspect-[4/3] bg-surface-raised">
                  {c.image ? (
                    <Image
                      src={c.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover grayscale-[35%] transition duration-300 group-hover:scale-105 group-hover:grayscale-0"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-2xl font-semibold text-text-tertiary">
                      {localized(locale as Locale, c.name, c.nameAr).charAt(0)}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-foreground">
                    {localized(locale as Locale, c.name, c.nameAr)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">{t("storeCount", { count: c.ids.length })}</p>
                </div>
              </Link>
            </li>
          ))}
        </Reveal>
      )}
    </div>
  );
}
