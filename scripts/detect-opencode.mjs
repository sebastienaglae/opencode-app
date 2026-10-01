#!/usr/bin/env node
// Detects where OpenCode is installed / running, without modifying it.
// Usage: node scripts/detect-opencode.mjs [--json]
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function serviceCandidates() {
  const home = homedir();
  const list = [];
  if (process.env.OPENCODE_SERVICE_FILE) list.push(process.env.OPENCODE_SERVICE_FILE);
  if (process.env.XDG_STATE_HOME) list.push(join(process.env.XDG_STATE_HOME, "opencode", "service.json"));
  list.push(join(home, ".local", "state", "opencode", "service.json"));
  if (process.env.LOCALAPPDATA) list.push(join(process.env.LOCALAPPDATA, "opencode", "service.json"));
  list.push(join(home, ".local", "share", "opencode", "service.json"));
  return list;
}

function findService() {
  for (const file of serviceCandidates()) {
    if (!existsSync(file)) continue;
    try {
      const reg = JSON.parse(readFileSync(file, "utf8"));
      if (reg?.url) return { file, reg };
    } catch {
      /* ignore */
    }
  }
  return null;
}

function findBinary() {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const out = execFileSync(cmd, ["opencode"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    return out[0] ?? null;
  } catch {
    return null;
  }
}

const service = findService();
const binary = findBinary();

const result = {
  detected: Boolean(service) || Boolean(binary),
  binary,
  serviceFile: service?.file ?? null,
  url: service?.reg?.url ?? null,
  version: service?.reg?.version ?? null,
  pid: service?.reg?.pid ?? null,
  hasPassword: Boolean(service?.reg?.password),
  hint: service
    ? "OpenCode service detected. Start the bridge with: npm run start (in ./bridge)"
    : binary
      ? "OpenCode is installed but no running service was found. Launch OpenCode (Desktop or TUI) once."
      : "OpenCode not detected. Install it from https://opencode.ai then launch it once.",
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("OpenCode detection");
  console.log("──────────────────");
  console.log(`  binary        : ${result.binary ?? "(not on PATH)"}`);
  console.log(`  service file  : ${result.serviceFile ?? "(not found)"}`);
  console.log(`  url           : ${result.url ?? "—"}`);
  console.log(`  version       : ${result.version ?? "—"}`);
  console.log(`  pid           : ${result.pid ?? "—"}`);
  console.log(`  password set  : ${result.hasPassword ? "yes" : "no"}`);
  console.log(`\n  ${result.hint}`);
}

process.exit(result.detected ? 0 : 1);
