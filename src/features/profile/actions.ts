"use server";

import { revalidatePath } from "next/cache";
import { profileService } from "@/server/services/profile.service";
import { requireUser } from "@/server/security/current-user";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import {
  profileSchema,
  addressSchema,
  addressIdSchema,
  updateAddressSchema,
} from "./schemas";

/**
 * Profile and address mutations.
 *
 * Each one re-derives the acting user from the session and passes that id to
 * the service — the user id is never taken from the form. Server actions are
 * reachable by direct POST, so a client-supplied `userId` would be an open
 * invitation to edit somebody else's account.
 */

export async function updateProfileAction(input: unknown): Promise<ApiResult<null>> {
  try {
    const user = await requireUser();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid profile", parsed.error.flatten());

    await profileService.update(user.id, parsed.data);

    revalidatePath("/account/profile");
    return ok(null, { message: "Profile updated." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function addAddressAction(input: unknown): Promise<ApiResult<null>> {
  try {
    const user = await requireUser();
    const parsed = addressSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid address", parsed.error.flatten());

    await profileService.addAddress(user.id, parsed.data);

    revalidatePath("/account/profile");
    return ok(null, { message: "Address added." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function updateAddressAction(input: unknown): Promise<ApiResult<null>> {
  try {
    const user = await requireUser();
    const parsed = updateAddressSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid address", parsed.error.flatten());

    const { addressId, ...values } = parsed.data;
    await profileService.updateAddress(user.id, addressId, values);

    revalidatePath("/account/profile");
    return ok(null, { message: "Address updated." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function deleteAddressAction(input: unknown): Promise<ApiResult<null>> {
  try {
    const user = await requireUser();
    const parsed = addressIdSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid address", parsed.error.flatten());

    await profileService.deleteAddress(user.id, parsed.data.addressId);

    revalidatePath("/account/profile");
    return ok(null, { message: "Address removed." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function setDefaultAddressAction(input: unknown): Promise<ApiResult<null>> {
  try {
    const user = await requireUser();
    const parsed = addressIdSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid address", parsed.error.flatten());

    await profileService.setDefaultAddress(user.id, parsed.data.addressId);

    revalidatePath("/account/profile");
    return ok(null, { message: "Default address updated." });
  } catch (err) {
    return toFailure(err);
  }
}
