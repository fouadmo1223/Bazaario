"use client";

import { useRouter } from "@/i18n/navigation";
import { ProductFormModal } from "./product-form-modal";
import type { Option, ProductFormValues } from "../queries";

/**
 * Thin client wrapper around `ProductFormModal` for the standalone edit page —
 * a Server Component can't hand a function like `onClose` across the boundary,
 * so this is what actually owns the "go back to the list" navigation.
 */
export function EditProductPage({
  vendorId,
  categories,
  brands,
  initial,
}: {
  vendorId: string;
  categories: Option[];
  brands: Option[];
  initial: ProductFormValues;
}) {
  const router = useRouter();

  return (
    <ProductFormModal
      open
      standalone
      onClose={() => router.push("/dashboard/products")}
      vendorId={vendorId}
      categories={categories}
      brands={brands}
      initial={initial}
    />
  );
}
