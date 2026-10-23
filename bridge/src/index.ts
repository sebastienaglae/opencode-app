import { networkInterfaces } from "node:os";
import { homedir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OpenCodeClient, type OpenCodeInfo } from "./opencode.ts";
import { loadConfig, parseArgs } from "./config.ts";
import { startBridge, type RunningBridge } from "./server.ts";
import { ensureTls } from "./tls.ts";

function addressRank(ip: string): number {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 5;
}

function localAddresses(): string[] {
  const out: string[] = [];
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal && !info.address.startsWith("169.254.")) {
        out.push(info.address);
      }
    }
  }
  return out.sort((a, b) => addressRank(a) - addressRank(b));
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

  // Allowed filesystem roots = OpenCode project directories (path scoping).
  let roots: string[] = [];
  try {
    const projects = await client.get<Array<{ canonical?: string }>>("/api/project");
    roots = (Array.isArray(projects) ? projects : [])
      .map((p) => p.canonical)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  } catch {
    /* scope disabled if projects cannot be listed */
  }

  let running: RunningBridge | undefined;
  let lastError: unknown;
  let tls: Awaited<ReturnType<typeof ensureTls>> | undefined;
  if (config.tls) {
    try {
      tls = await ensureTls(config.cert, config.key);
    } catch (err) {
      console.error("[bridge] Failed to prepare TLS:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  for (const port of config.ports) {
    try {
      running = await startBridge(config, client, info, port, roots, tls);
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
  const scheme = config.tls ? "https" : "http";
  lines.push(`  Bridge listening : ${scheme}://${config.host}:${running.port}`);
  lines.push(`  Auth             : ${config.anonymous ? "anonymous (disabled)" : `Bearer ${config.token}`}`);
  if (tls?.fingerprint) lines.push(`  TLS fingerprint  : ${tls.fingerprint}`);
  lines.push(`  Path scope       : ${config.allowAnyPath ? "ANY (unsafe)" : `${roots.length} project root(s)`}`);
  lines.push("");
  lines.push("  Enter one of these in the app (Settings):");
  lines.push(`    host: 127.0.0.1        port: ${running.port}   (same machine)`);
  for (const a of addrs) {
    lines.push(`    host: ${a.padEnd(15)} port: ${running.port}   (LAN / VPN)`);
  }
  lines.push("");
  lines.push(`  Event stream: ${config.tls ? "wss" : "ws"}://<host>:` + running.port + "/events?token=<token>");
  lines.push("");
  const pair =
    !config.anonymous && addrs[0]
      ? `ai.opencode.remote://connect?host=${addrs[0]}&port=${running.port}&token=${config.token}${config.tls ? "&secure=1" : ""}`
      : undefined;
  if (pair) {
    lines.push("  Pairing link (Android/iOS app):");
    lines.push(`    ${pair}`);
    lines.push("    adb shell \"am start -a android.intent.action.VIEW -d '" + pair + "'\"");
    lines.push("");
  }
  console.log(lines.join("\n"));

  if (pair) {
    const dir = join(homedir(), ".opencode-remote");
    mkdirSync(dir, { recursive: true });
    const qrPath = join(dir, "qr.png");
    const statePath = join(dir, "state.json");

    try {
      writeFileSync(
        statePath,
        JSON.stringify(
          {
            host: addrs[0],
            hosts: addrs,
            port: running.port,
            token: config.token,
            link: pair,
            qr: qrPath,
            tls: config.tls,
            fingerprint: tls?.fingerprint ?? null,
            version: info?.version ?? null,
            updated: Date.now(),
          },
          null,
          2,
        ),
        "utf8",
      );
      console.log(`  State    : ${statePath}`);
    } catch (err) {
      console.warn("[bridge] state write failed:", err instanceof Error ? err.message : err);
    }

    try {
      const QRCode = (await import("qrcode")).default;
      await QRCode.toFile(qrPath, pair, { width: 512, margin: 2 });
      const ascii = await QRCode.toString(pair, { type: "terminal", small: true });
      console.log(ascii);
      console.log(`  QR image : ${qrPath}\n`);
    } catch (err) {
      console.warn("[bridge] QR generation failed:", err instanceof Error ? err.message : err);
    }
  }

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
