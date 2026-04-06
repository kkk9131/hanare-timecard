import { networkInterfaces } from "node:os";
import { serve } from "@hono/node-server";
import { runMigrations } from "../../scripts/migrate.js";
import { createApp } from "./app.js";

function resolvePort(): number {
  const raw = process.env.PORT;
  if (!raw) return 3000;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0 || n > 65535) return 3000;
  return n;
}

function listLanAddresses(): string[] {
  const nets = networkInterfaces();
  const out: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const info of nets[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) {
        out.push(info.address);
      }
    }
  }
  return out;
}

function printStartupBanner(port: number): void {
  const lines: string[] = [];
  lines.push("");
  lines.push("  hanare-timecard server");
  lines.push(`  -> http://localhost:${port}`);
  for (const addr of listLanAddresses()) {
    lines.push(`  -> http://${addr}:${port}  (LAN)`);
  }
  lines.push("");
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main(): void {
  runMigrations();
  const app = createApp();
  const port = resolvePort();

  serve(
    {
      fetch: app.fetch,
      hostname: "0.0.0.0",
      port,
    },
    () => {
      printStartupBanner(port);
    },
  );
}

main();
