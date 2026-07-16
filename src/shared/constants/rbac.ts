/**
 * Single source of truth for Role-Based Access Control.
 * Guards in the service layer are authoritative; `proxy.ts` uses this only
 * for optimistic edge redirects.
 */

export const ROLES = {
  GUEST: "guest",
  CUSTOMER: "customer",
  VENDOR: "vendor",
  MARKETING: "marketing",
  SUPPORT: "support",
  DELIVERY_DRIVER: "delivery_driver",
  SUPER_ADMIN: "super_admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** `resource:action` permission identifiers. */
export const PERMISSIONS = {
  CATALOG_READ: "catalog:read",
  CART_WRITE: "cart:write",
  ORDER_CREATE: "order:create",
  ORDER_READ_OWN: "order:read:own",
  ORDER_READ_VENDOR: "order:read:vendor",
  ORDER_FULFILL: "order:fulfill",
  /** Moving money back to a customer — strictly narrower than reading orders. */
  ORDER_REFUND: "order:refund",
  DELIVERY_UPDATE: "delivery:update",
  PRODUCT_WRITE: "product:write",
  INVENTORY_WRITE: "inventory:write",
  COUPON_WRITE: "coupon:write",
  CAMPAIGN_WRITE: "campaign:write",
  TICKET_RESPOND: "ticket:respond",
  CMS_WRITE: "cms:write",
  ANALYTICS_READ: "analytics:read",
  VENDOR_MANAGE: "vendor:manage",
  USERS_MANAGE: "users:manage",
  PLATFORM_SETTINGS: "platform:settings",
  AUDIT_READ: "audit:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

/** Base permissions granted purely by role (vendor scope applied at query time). */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [ROLES.GUEST]: [P.CATALOG_READ],
  [ROLES.CUSTOMER]: [P.CATALOG_READ, P.CART_WRITE, P.ORDER_CREATE, P.ORDER_READ_OWN],
  [ROLES.DELIVERY_DRIVER]: [P.CATALOG_READ, P.ORDER_READ_VENDOR, P.ORDER_FULFILL, P.DELIVERY_UPDATE],
  [ROLES.SUPPORT]: [P.CATALOG_READ, P.ORDER_READ_VENDOR, P.TICKET_RESPOND],
  [ROLES.MARKETING]: [P.CATALOG_READ, P.ORDER_READ_VENDOR, P.COUPON_WRITE, P.CAMPAIGN_WRITE, P.CMS_WRITE, P.ANALYTICS_READ],
  [ROLES.VENDOR]: [
    P.CATALOG_READ, P.ORDER_READ_VENDOR, P.ORDER_FULFILL, P.ORDER_REFUND, P.DELIVERY_UPDATE,
    P.PRODUCT_WRITE, P.INVENTORY_WRITE, P.COUPON_WRITE, P.CAMPAIGN_WRITE,
    P.TICKET_RESPOND, P.CMS_WRITE, P.ANALYTICS_READ,
  ],
  // Super admin is checked with a wildcard short-circuit in `can()`.
  [ROLES.SUPER_ADMIN]: Object.values(P),
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  if (role === ROLES.SUPER_ADMIN) return true;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function anyRoleHasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => roleHasPermission(r, permission));
}
