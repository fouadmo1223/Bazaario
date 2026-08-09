import { Server as IOServer } from "socket.io";
import type { Server as HTTPServer } from "node:http";
import type { Socket as NetSocket } from "node:net";
import type { NextApiRequest, NextApiResponse } from "next";
import { attachRealtimeHandlers, attachRedisBridge, applyRedisAdapter } from "@/server/realtime/setup";

/**
 * Realtime endpoint for hosts that can't run a persistent process — Vercel's
 * serverless functions chief among them. `src/server/realtime/server.ts` is
 * the traditional always-on alternative; this file exists specifically to
 * make the app work when that isn't an option.
 *
 * The mechanism: a Pages Router API route is the one place Next.js exposes
 * the raw Node `http.Server` a request landed on (`res.socket.server`) —
 * App Router route handlers don't. Socket.IO attaches to that same server
 * the same way it would in a traditional Node app. `res.socket.server.io`
 * is then cached on the server object itself, so a *warm* function
 * invocation (the same container handling a later request) reuses the
 * existing `io` instance instead of re-attaching.
 *
 * What this does NOT get you: a Vercel function invocation has a hard
 * execution-time ceiling, so a "connection" here is really a bounded
 * window, not truly persistent — Socket.IO's client auto-reconnects when
 * that window closes, which is why the app still works, just with more
 * reconnect churn than a real always-on server. And a cold start, or a
 * second invocation running concurrently on a different container, gets
 * its OWN `io` instance with no shared memory — which is exactly why
 * `applyRedisAdapter` is not optional here the way it is for the
 * standalone server: without it, two users on different warm containers
 * could never reach each other in the same room.
 */

interface SocketServer extends HTTPServer {
  io?: IOServer;
}
interface SocketWithIO extends NetSocket {
  server: SocketServer;
}
interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

export default function handler(_req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (!res.socket.server.io) {
    const io = new IOServer(res.socket.server, {
      path: "/api/socket",
      cors: { origin: process.env.NEXT_PUBLIC_APP_URL, credentials: true },
      // Polling first: it's what actually reaches this handler and attaches
      // `io` in the first place (a raw websocket upgrade request never
      // invokes a Next.js API route at all). See use-socket.ts for the
      // client-side half of this.
      transports: ["polling", "websocket"],
    });

    applyRedisAdapter(io);
    attachRealtimeHandlers(io);
    attachRedisBridge(io);

    res.socket.server.io = io;
  }

  res.end();
}

// Socket.IO needs the raw request stream (its own polling/upgrade
// handshake), not Next's parsed body.
export const config = {
  api: { bodyParser: false },
};
