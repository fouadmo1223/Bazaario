// Run the Next dev server and the standalone realtime socket server together,
// so `npm run dev:all` gives a fully working app — chat included — from one
// terminal. Without the realtime process the socket has nothing to connect to
// and every thread shows "Offline — replies appear on refresh".
//
// Deliberately dependency-free (no `concurrently`): it spawns the two npm
// scripts, prefixes their output, and makes sure that killing one — or Ctrl-C —
// takes the other down with it, so there is never an orphaned server holding a
// port.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const procs = [
  { name: "next", color: "\x1b[36m", args: ["run", "dev"] },
  { name: "realtime", color: "\x1b[35m", args: ["run", "realtime"] },
];

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code ?? 0);
}

for (const { name, color, args } of procs) {
  const child = spawn(npm, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
  const tag = `${color}[${name}]\x1b[0m `;

  const prefix = (stream) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(`${tag}${line}\n`);
    });
  };
  prefix(child.stdout);
  prefix(child.stderr);

  child.on("exit", (code) => {
    process.stdout.write(`${tag}exited with code ${code}\n`);
    shutdown(code ?? 0);
  });

  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
