export type VendorSettingsView = {
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
};

/** Shapes a vendor doc (already resolved by the caller) for the settings form. */
export function toVendorSettingsView(vendor: {
  name: string;
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
}): VendorSettingsView {
  return {
    name: vendor.name,
    nameAr: vendor.nameAr ?? "",
    description: vendor.description ?? "",
    descriptionAr: vendor.descriptionAr ?? "",
  };
}
