import jwt from "jsonwebtoken";
import { requireUser } from "@/server/security/current-user";
import { getServerEnv } from "@/shared/config/env";
import { json, route } from "@/shared/lib/api-response";

/**
 * Mint a short-lived token for the Socket.IO handshake.
 *
 * The access token lives in an httpOnly cookie, which browser JS cannot read
 * and therefore cannot hand to `io({ auth: { token } })`. Rather than drop the
 * httpOnly flag — which would expose the real session to any XSS on the page —
 * this endpoint reads the cookie server-side and issues a separate token that
 * is only good for opening a socket.
 *
 * It is deliberately short-lived: it is used within milliseconds of being
 * fetched, and the socket stays up on its own once connected, so a 60-second
 * window is ample. If it leaks, it expires before it is useful.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const env = getServerEnv();

  const token = jwt.sign(
    { sub: user.id, email: user.email, roles: user.roles },
    env.JWT_ACCESS_SECRET,
    { expiresIn: 60, algorithm: "HS256" },
  );

  return json({ token, expiresIn: 60 });
});

// Never cached: the response is per-user and valid for one minute.
export const dynamic = "force-dynamic";
