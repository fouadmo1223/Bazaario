"use server";

import { orderService } from "@/server/services/order.service";
import { requireVendorPermission, requireUser } from "@/server/security/current-user";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { toFailure, ok, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { revalidatePath } from "next/cache";
import { ORDER_STATUSES, type OrderDoc, type OrderStatus } from "@/server/database/models/order.model";
import { z } from "zod";

function serialize(o: OrderDoc) {
  return JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
}

const statusSchema = z.enum(ORDER_STATUSES);

/** Vendor staff updating an order's status (fulfilment permission). */
export async function updateOrderStatusAction(
  vendorId: string,
  orderId: string,
  status: string,
  note?: string,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.ORDER_FULFILL);
    const parsed = statusSchema.safeParse(status);
    if (!parsed.success) throw Errors.badRequest("Unknown order status");

    const order = await orderService.updateStatus(vendorId, orderId, parsed.data, user.id, note);
    revalidatePath(`/dashboard/${vendorId}/orders/${orderId}`);
    return ok(serialize(order), { message: `Order marked ${parsed.data}.` });
  } catch (err) {
    return toFailure(err);
  }
}

export async function refundOrderAction(
  vendorId: string,
  orderId: string,
  input: { amount: number; reason?: string },
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    // Refunds move money, so they need `order:refund` — which only the vendor
    // admin and super admin hold. Guarding on `order:read:vendor` here would let
    // support, marketing, and delivery drivers issue refunds too.
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.ORDER_REFUND);
    const schema = z.object({ amount: z.number().positive(), reason: z.string().optional() });
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid refund", parsed.error.flatten());

    const order = await orderService.refund(vendorId, orderId, user.id, parsed.data);
    revalidatePath(`/dashboard/${vendorId}/orders/${orderId}`);
    return ok(serialize(order), { message: "Refund recorded." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function assignDriverAction(
  vendorId: string,
  orderId: string,
  driverId: string,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.ORDER_FULFILL);
    const order = await orderService.assignDriver(vendorId, orderId, driverId, user.id);
    revalidatePath(`/dashboard/${vendorId}/orders/${orderId}`);
    return ok(serialize(order), { message: "Driver assigned." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function addOrderNoteAction(
  vendorId: string,
  orderId: string,
  text: string,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.ORDER_READ_VENDOR);
    if (!text.trim()) throw Errors.badRequest("Note cannot be empty");
    const order = await orderService.addNote(vendorId, orderId, user.id, text.trim());
    revalidatePath(`/dashboard/${vendorId}/orders/${orderId}`);
    return ok(serialize(order));
  } catch (err) {
    return toFailure(err);
  }
}

/** Driver updating delivery progress on an order assigned to them. */
export async function driverUpdateStatusAction(
  vendorId: string,
  orderId: string,
  status: OrderStatus,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.DELIVERY_UPDATE);
    const order = await orderService.getForVendor(vendorId, orderId);

    // A driver may only touch orders assigned to them.
    if (String(order.shipping.driver ?? "") !== user.id) {
      throw Errors.forbidden("This order is not assigned to you");
    }
    const allowed: OrderStatus[] = ["out_for_delivery", "delivered"];
    if (!allowed.includes(status)) throw Errors.forbidden("Drivers cannot set this status");

    const updated = await orderService.updateStatus(vendorId, orderId, status, user.id);
    return ok(serialize(updated), { message: `Marked ${status}.` });
  } catch (err) {
    return toFailure(err);
  }
}

export type ReorderResult = {
  added: number;
  skipped: { title: string; reason: string }[];
  vendorSlug: string;
};

/** Customer re-adding a past order's items to their cart. */
export async function reorderAction(orderId: string): Promise<ApiResult<ReorderResult>> {
  try {
    const user = await requireUser();
    const result = await orderService.reorder(user.id, orderId);
    if (result.added > 0) revalidatePath(`/v/${result.vendorSlug}/cart`);
    return ok(result, {
      message:
        result.added > 0
          ? `Added ${result.added} item${result.added === 1 ? "" : "s"} to your cart.`
          : "None of these items are available anymore.",
    });
  } catch (err) {
    return toFailure(err);
  }
}

/** Customer cancelling their own order (only while still pending). */
export async function customerCancelOrderAction(orderId: string): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const user = await requireUser();
    const order = await orderService.getForCustomer(user.id, orderId);
    if (order.status !== "pending") {
      throw Errors.badRequest("This order can no longer be cancelled");
    }
    const updated = await orderService.cancel(String(order.vendor), orderId, user.id, "Cancelled by customer");
    revalidatePath("/account/orders");
    return ok(serialize(updated), { message: "Order cancelled." });
  } catch (err) {
    return toFailure(err);
  }
}
