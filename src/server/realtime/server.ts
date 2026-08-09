import { createServer } from "node:http";
import { Server } from "socket.io";
import { attachRealtimeHandlers, attachRedisBridge, applyRedisAdapter } from "./setup";

/**
 * Standalone Socket.IO server for hosts that can run a persistent process
 * (Railway / Fly / a small VM) — the traditional, no-caveats way to run
 * this. `src/pages/api/socket.ts` is the alternative for Vercel, which
 * cannot hold a long-lived process; see that file's comment for the
 * tradeoffs that come with it. Both share the actual room/auth/bridge logic
 * from `./setup.ts`.
 *
 * Run with: `npm run realtime`
 */

const PORT = Number(process.env.REALTIME_PORT ?? 4000);
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

function start() {
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "realtime" }));
  });

  const io = new Server(httpServer, {
    cors: { origin: ORIGIN, credentials: true },
    path: "/socket.io",
  });

  // A single always-on process never strictly needs cross-instance routing,
  // but applying it is cheap and means running two of these behind a load
  // balancer (or a rolling deploy overlapping old/new) just works.
  applyRedisAdapter(io);
  attachRealtimeHandlers(io);
  attachRedisBridge(io);

  httpServer.listen(PORT, () => {
    console.log(`Realtime server listening on :${PORT}`);
  });
}

start();
