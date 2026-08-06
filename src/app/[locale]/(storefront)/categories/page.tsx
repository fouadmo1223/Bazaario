import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { catalogService } from "@/server/services/catalog.service";
import { Reveal } from "@/shared/components/reveal";
import { setRequestLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Categories · Bazaario",
  description: "Browse the marketplace by category.",
  alternates: { canonical: "/categories" },
};

export const revalidate = 300;

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const categories = await catalogService.categories();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Categories
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {categories.length} {categories.length === 1 ? "category" : "categories"} across the
          marketplace
        </p>
      </header>

      {categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-16 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">No categories yet.</p>
        </div>
      ) : (
        <Reveal as="ul" stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className="group block overflow-hidden rounded-xl border border-zinc-200 transition hover:border-indigo-400 hover:shadow-md dark:border-zinc-800"
              >
                <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
                  {c.image ? (
                    <Image
                      src={c.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl font-semibold text-zinc-300 dark:text-zinc-700">
                      {c.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {c.ids.length} {c.ids.length === 1 ? "store" : "stores"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </Reveal>
      )}
    </div>
  );
}
