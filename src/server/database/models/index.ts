/**
 * Central model registry. Importing from here guarantees every Mongoose model
 * is registered before any `.populate()` runs (avoids "Schema hasn't been
 * registered for model X" when a referenced model wasn't otherwise imported).
 */
export { User } from "./user.model";
export { Membership } from "./membership.model";
export { Market } from "./market.model";
export { Category } from "./category.model";
export { Brand } from "./brand.model";
export { Product } from "./product.model";
export { Variant } from "./variant.model";
export { Inventory } from "./inventory.model";
export { VerificationToken } from "./verification-token.model";
export { AuditLog } from "./audit-log.model";

export type { UserRaw, UserDoc } from "./user.model";
export type { MembershipRaw, MembershipDoc } from "./membership.model";
export type { MarketRaw, MarketDoc } from "./market.model";
export type { CategoryRaw, CategoryDoc } from "./category.model";
export type { BrandRaw, BrandDoc } from "./brand.model";
export type { ProductRaw, ProductDoc } from "./product.model";
export type { VariantRaw, VariantDoc } from "./variant.model";
export type { InventoryRaw, InventoryDoc } from "./inventory.model";
