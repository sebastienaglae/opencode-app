import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** Default obscure ports, tried in order until one is free. */
export const DEFAULT_PORTS = [
  47821, 47311, 48240, 46901, 49923, 45177, 48812, 46355, 49730, 47688,
];

/** Candidate locations of the OpenCode shared-service registration file. */
export function serviceFileCandidates(): string[] {
  const home = homedir();
  const list: string[] = [];
  if (process.env.OPENCODE_SERVICE_FILE) list.push(process.env.OPENCODE_SERVICE_FILE);
  if (process.env.XDG_STATE_HOME) list.push(join(process.env.XDG_STATE_HOME, "opencode", "service.json"));
  list.push(join(home, ".local", "state", "opencode", "service.json"));
  if (process.env.LOCALAPPDATA) list.push(join(process.env.LOCALAPPDATA, "opencode", "service.json"));
  list.push(join(home, ".local", "share", "opencode", "service.json"));
  list.push(join(home, ".opencode", "service.json"));
  return list;
}

export function privateConfigCandidates(): string[] {
  const home = homedir();
  const list: string[] = [];
  if (process.env.XDG_CONFIG_HOME) list.push(join(process.env.XDG_CONFIG_HOME, "opencode", "service.json"));
  list.push(join(home, ".config", "opencode", "service.json"));
  if (process.env.APPDATA) list.push(join(process.env.APPDATA, "opencode", "service.json"));
  return list;
}

export type ServiceRegistration = {
  id?: string;
  version?: string;
  url: string;
  pid?: number;
  password?: string;
};

export function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function discoverService(explicitFile?: string): ServiceRegistration | undefined {
  const files = explicitFile
    ? [explicitFile, ...serviceFileCandidates()]
    : serviceFileCandidates();
  for (const file of files) {
    if (!existsSync(file)) continue;
    const reg = readJson<ServiceRegistration>(file);
    if (reg?.url) return reg;
  }
  return undefined;
}

export function discoverPassword(): string | undefined {
  for (const file of privateConfigCandidates()) {
    const cfg = readJson<{ password?: string }>(file);
    if (cfg?.password) return cfg.password;
  }
  return undefined;
}

export type BridgeConfig = {
  host: string;
  ports: number[];
  token: string;
  opencodeUrl: string;
  opencodePassword?: string;
  opencodeVersion?: string;
  corsOrigin: string;
  anonymous: boolean;
  configFile: string;
};

export type CliOptions = {
  host?: string;
  ports?: number[];
  token?: string;
  server?: string;
  password?: string;
  cors?: string;
  anonymous?: boolean;
  serviceFile?: string;
  configFile?: string;
};

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--host": opts.host = next(); break;
      case "--server": opts.server = next(); break;
      case "--password": opts.password = next(); break;
      case "--token": opts.token = next(); break;
      case "--cors": opts.cors = next(); break;
      case "--service-file": opts.serviceFile = next(); break;
      case "--config-file": opts.configFile = next(); break;
      case "--ports":
        opts.ports = (next() ?? "")
          .split(",")
          .map((p) => Number.parseInt(p.trim(), 10))
          .filter((p) => Number.isFinite(p) && p > 0);
        break;
      case "--anonymous": opts.anonymous = true; break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }
  return opts;
}

export function printHelp(): void {
  console.log(`opencode-remote-bridge

Usage: npm start -- [options]

Options:
  --server <url>        OpenCode service base URL (default: read service.json)
  --password <secret>   OpenCode service password (default: read service.json)
  --token <token>       Bearer token required from the app (default: persisted/generated)
  --host <addr>         Address to bind (default: 0.0.0.0)
  --ports <a,b,c>       Candidate ports, tried in order
  --cors <origin>       Allowed CORS origin (default: *)
  --anonymous           Disable token authentication (LAN/dev only)
  --service-file <path> Explicit OpenCode service.json path
  --config-file <path>  Where to persist the generated token
  -h, --help            Show this help
`);
}

const DEFAULT_CONFIG_FILE = join(homedir(), ".opencode-remote", "config.json");

export function loadConfig(opts: CliOptions): BridgeConfig {
  const configFile = opts.configFile ?? DEFAULT_CONFIG_FILE;
  const persisted = readJson<{ token?: string }>(configFile) ?? {};

  const token = opts.token ?? persisted.token ?? randomBytes(32).toString("base64url");
  if (!persisted.token || opts.token) {
    try {
      mkdirSync(dirname(configFile), { recursive: true });
      writeFileSync(configFile, JSON.stringify({ token }, null, 2) + "\n", "utf8");
    } catch {
      /* best effort */
    }
  }

  const reg = discoverService(opts.serviceFile);
  const opencodeUrl = (opts.server ?? reg?.url ?? "").replace(/\/$/, "");
  const opencodePassword = opts.password ?? reg?.password ?? discoverPassword();

  return {
    host: opts.host ?? "0.0.0.0",
    ports: opts.ports && opts.ports.length ? opts.ports : DEFAULT_PORTS,
    token,
    opencodeUrl,
    opencodePassword,
    opencodeVersion: reg?.version,
    corsOrigin: opts.cors ?? "*",
    anonymous: opts.anonymous ?? false,
    configFile,
  };
}
