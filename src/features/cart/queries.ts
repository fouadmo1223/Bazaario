import { Cart } from "@/server/database/models/cart.model";
import { Coupon } from "@/server/database/models/coupon.model";
import { connectToDatabase } from "@/server/database/connection";
import { getCurrentUser } from "@/server/security/current-user";
import { readGuestToken } from "@/server/security/guest-token";
import { computeTotals, vendorTaxRate, type Totals } from "@/server/services/pricing.service";
import type { VendorDoc } from "@/server/database/models/vendor.model";

/**
 * Read-side model for the cart. Server Components render this and pass it to
 * client components, so every field is a plain serializable value — no Mongoose
 * documents or ObjectIds cross the boundary.
 */
export type CartLineView = {
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type CartView = {
  currency: string;
  items: CartLineView[];
  itemCount: number;
  coupon: string | null;
  /** Shipping is 0 until a method is chosen at checkout; tax follows vendor rules. */
  totals: Totals;
};

function emptyCart(currency: string): CartView {
  return {
    currency,
    items: [],
    itemCount: 0,
    coupon: null,
    totals: { subtotal: 0, discount: 0, tax: 0, shipping: 0, grandTotal: 0 },
  };
}

/**
 * Load the current visitor's cart for a vendor.
 *
 * Read-only by design: it never mints a guest token, because Server Components
 * cannot set cookies. A visitor with no cart simply sees an empty one — the
 * token gets created on their first add-to-cart, which runs in an action.
 */
export async function getCartView(vendor: VendorDoc): Promise<CartView> {
  const currency = vendor.settings.currency;

  const user = await getCurrentUser();
  const guestToken = user ? undefined : await readGuestToken();
  if (!user && !guestToken) return emptyCart(currency);

  await connectToDatabase();
  const cart = await Cart.findOne(
    user ? { vendor: vendor._id, user: user.id } : { vendor: vendor._id, guestToken },
  );
  if (!cart || cart.items.length === 0) return emptyCart(currency);

  const items: CartLineView[] = cart.items.map((i) => ({
    productId: String(i.product),
    variantId: i.variant ? String(i.variant) : null,
    title: i.title,
    image: i.image ?? null,
    sku: i.sku ?? null,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    lineTotal: Math.round(i.unitPrice * i.quantity * 100) / 100,
  }));

  // A stored coupon may have expired or been withdrawn since it was applied, so
  // resolve it again rather than trusting the code on the cart.
  const coupon = cart.coupon
    ? await Coupon.findOne({ vendor: vendor._id, code: cart.coupon, isActive: true })
    : null;

  const totals = computeTotals(
    items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity })),
    {
      coupon,
      taxRate: vendorTaxRate(vendor.settings),
      taxInclusive: vendor.settings.taxInclusive,
      // Shipping is unknown until a delivery method is picked at checkout.
      shippingBase: 0,
    },
  );

  return {
    currency,
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    coupon: coupon ? coupon.code : null,
    totals,
  };
}
