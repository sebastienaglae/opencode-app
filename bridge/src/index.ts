import { networkInterfaces } from "node:os";
import { OpenCodeClient, type OpenCodeInfo } from "./opencode.ts";
import { loadConfig, parseArgs } from "./config.ts";
import { startBridge, type RunningBridge } from "./server.ts";

function localAddresses(): string[] {
  const out: string[] = [];
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal) out.push(info.address);
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = loadConfig(opts);

  if (!config.opencodeUrl) {
    console.error(
      "\n[bridge] No OpenCode service found.\n" +
        "  Start OpenCode (Desktop/TUI) first, or pass --server <url> [--password <secret>].\n",
    );
    process.exit(1);
  }

  const client = new OpenCodeClient(config.opencodeUrl, config.opencodePassword);

  let info: OpenCodeInfo | undefined;
  try {
    info = await client.info(AbortSignal.timeout(4000));
  } catch (err) {
    console.warn(
      `[bridge] Warning: could not reach OpenCode at ${config.opencodeUrl} (${err instanceof Error ? err.message : String(err)}).`,
    );
    console.warn("[bridge] The bridge will still start and retry through the proxy.");
  }

  let running: RunningBridge | undefined;
  let lastError: unknown;
  for (const port of config.ports) {
    try {
      running = await startBridge(config, client, info, port);
      break;
    } catch (err) {
      lastError = err;
      const code = (err as { code?: string }).code;
      if (code === "EADDRINUSE") {
        console.warn(`[bridge] Port ${port} busy, trying next…`);
        continue;
      }
      throw err;
    }
  }

  if (!running) {
    console.error(`[bridge] No free port among: ${config.ports.join(", ")}`);
    if (lastError) console.error(lastError);
    process.exit(1);
  }

  const addrs = localAddresses();
  const lines: string[] = [];
  lines.push("");
  lines.push("  OpenCode Remote bridge is running");
  lines.push("  ─────────────────────────────────────────────");
  lines.push(`  OpenCode service : ${client.baseUrl}${info ? `  (v${info.version})` : "  (unreachable)"}`);
  lines.push(`  Bridge listening : ${config.host}:${running.port}`);
  lines.push(`  Auth             : ${config.anonymous ? "anonymous (disabled)" : `Bearer ${config.token}`}`);
  lines.push("");
  lines.push("  Enter one of these in the app (Settings):");
  lines.push(`    host: 127.0.0.1        port: ${running.port}   (same machine)`);
  for (const a of addrs) {
    lines.push(`    host: ${a.padEnd(15)} port: ${running.port}   (LAN / VPN)`);
  }
  lines.push("");
  lines.push("  Event stream: ws://<host>:" + running.port + "/events?token=<token>");
  lines.push("");
  console.log(lines.join("\n"));

  const shutdown = () => {
    console.log("\n[bridge] Shutting down…");
    running?.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[bridge] Fatal:", err);
  process.exit(1);
});
