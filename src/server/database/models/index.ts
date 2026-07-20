/**
 * Central model registry. Importing from here guarantees every Mongoose model
 * is registered before any `.populate()` runs (avoids "Schema hasn't been
 * registered for model X" when a referenced model wasn't otherwise imported).
 */
export { User } from "./user.model";
export { Membership } from "./membership.model";
export { Vendor } from "./vendor.model";
export { Category } from "./category.model";
export { Brand } from "./brand.model";
export { Product } from "./product.model";
export { Variant } from "./variant.model";
export { Inventory } from "./inventory.model";
export { Cart } from "./cart.model";
export { Wishlist } from "./wishlist.model";
export { Coupon } from "./coupon.model";
export { Address } from "./address.model";
export { Order } from "./order.model";
export { Notification } from "./notification.model";
export { Conversation } from "./conversation.model";
export { Message } from "./message.model";
export { VerificationToken } from "./verification-token.model";
export { AuditLog } from "./audit-log.model";

export type { UserRaw, UserDoc } from "./user.model";
export type { MembershipRaw, MembershipDoc } from "./membership.model";
export type { VendorRaw, VendorDoc } from "./vendor.model";
export type { CategoryRaw, CategoryDoc } from "./category.model";
export type { BrandRaw, BrandDoc } from "./brand.model";
export type { ProductRaw, ProductDoc } from "./product.model";
export type { VariantRaw, VariantDoc } from "./variant.model";
export type { InventoryRaw, InventoryDoc } from "./inventory.model";
export type { CartRaw, CartDoc } from "./cart.model";
export type { WishlistRaw, WishlistDoc } from "./wishlist.model";
export type { CouponRaw, CouponDoc } from "./coupon.model";
export type { AddressRaw, AddressDoc } from "./address.model";
export type { OrderRaw, OrderDoc, OrderStatus } from "./order.model";
export type { NotificationRaw, NotificationDoc } from "./notification.model";
export type { ConversationRaw, ConversationDoc, ConversationKind, ConversationStatus } from "./conversation.model";
export type { MessageRaw, MessageDoc } from "./message.model";
