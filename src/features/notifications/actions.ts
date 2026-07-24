"use server";

import { notificationService } from "@/server/services/notification.service";
import { requireUser } from "@/server/security/current-user";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";

/**
 * Notification mutations.
 *
 * Both re-authenticate — a server action is reachable by direct POST, so the
 * page having rendered the bell is not a check. Neither takes a user id: the
 * service scopes every write to `requireUser`'s id, so the only notifications a
 * caller can mark read are their own, and passing someone else's id is not
 * expressible.
 */

export async function markNotificationReadAction(
  notificationId: string,
): Promise<ApiResult<null>> {
  try {
    const user = await requireUser();
    await notificationService.markRead(user.id, notificationId);
    return ok(null);
  } catch (err) {
    return toFailure(err);
  }
}

export async function markAllNotificationsReadAction(): Promise<ApiResult<{ updated: number }>> {
  try {
    const user = await requireUser();
    const updated = await notificationService.markAllRead(user.id);
    return ok({ updated });
  } catch (err) {
    return toFailure(err);
  }
}
