import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import { resolve, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { OpenCodeClient, type OpenCodeInfo } from "./opencode.ts";
import type { BridgeConfig } from "./config.ts";

export type RunningBridge = {
  server: Server;
  port: number;
  url: string;
};

const ALLOW_HEADERS = "authorization, content-type, accept, x-requested-with";
const ALLOW_METHODS = "GET, POST, PATCH, PUT, DELETE, OPTIONS";

/** Common local dev-server ports probed for the in-app preview. */
const DEV_PORTS = [3000, 3001, 3002, 4200, 4321, 5000, 5001, 5173, 5174, 7000, 8000, 8080, 8888, 9000, 1234, 1420, 4000, 6006, 4173, 8001, 8081, 9001];

function lanIPv4(): string | null {
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return null;
}

/** Probes dev-server ports on the LAN address (i.e. reachable from outside,
 *  not just bound to localhost). */
async function probeDevServers(): Promise<Array<{ port: number; url: string }>> {
  const host = lanIPv4() ?? "127.0.0.1";
  const results = await Promise.all(
    DEV_PORTS.map(async (port) => {
      try {
        const res = await fetch(`http://${host}:${port}/`, { signal: AbortSignal.timeout(800) });
        if (res.status < 500) return { port, url: `http://${host}:${port}` };
      } catch {
        /* not reachable */
      }
      return null;
    }),
  );
  return results.filter((r): r is { port: number; url: string } => r !== null);
}

const norm = (p: string) => resolve(p).replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");

/** Returns true when the requested filesystem path stays inside one of the
 *  OpenCode project roots. */
function isPathAllowed(pathname: string, url: URL, roots: string[]): boolean {
  const isFsRoute = pathname.startsWith("/api/fs/") || pathname === "/api/experimental/fs/write";
  if (!isFsRoute) return true;
  if (roots.length === 0) return true; // cannot determine scope → don't break

  let target: string | undefined;
  if (pathname.startsWith("/api/fs/read/")) target = decodeURIComponent(pathname.slice("/api/fs/read/".length));
  else target = url.searchParams.get("path") ?? undefined;

  if (!target) {
    // Defaults to the requested location directory, which the app sets to a project.
    const loc = url.searchParams.get("location[directory]");
    if (!loc) return true;
    target = loc;
  }

  const base = url.searchParams.get("location[directory]") ?? roots[0];
  const absolute = /^[a-zA-Z]:[\\/]/.test(target) || target.startsWith("/") ? target : resolve(base, target);
  const normalized = norm(absolute);
  return roots.some((root) => {
    const r = norm(root);
    return normalized === r || normalized.startsWith(r + "/") || normalized.startsWith(r + sep.toLowerCase());
  });
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function tokenFrom(req: IncomingMessage, url: URL): string | null {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const q = url.searchParams.get("token");
  return q && q.length > 0 ? q : null;
}

export function startBridge(
  config: BridgeConfig,
  client: OpenCodeClient,
  info: OpenCodeInfo | undefined,
  port: number,
  roots: string[] = [],
  tls?: { cert: string; key: string },
): Promise<RunningBridge> {
  const startedAt = Date.now();
  let eventClients = 0;
  let eventAbort: AbortController | null = null;
  const sockets = new Set<WebSocket>();

  const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : config.corsOrigin;

    res.setHeader("access-control-allow-origin", origin || "*");
    res.setHeader("access-control-allow-headers", ALLOW_HEADERS);
    res.setHeader("access-control-allow-methods", ALLOW_METHODS);
    res.setHeader("access-control-max-age", "86400");
    res.setHeader("vary", "origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    try {
      if (url.pathname === "/health" || url.pathname === "/") {
        send(200, {
          ok: true,
          service: "opencode-remote-bridge",
          port,
          uptime: Math.round((Date.now() - startedAt) / 1000),
          clients: eventClients,
          opencode: {
            url: client.baseUrl,
            version: info?.version,
            pid: info?.pid,
          },
        });
        return;
      }

      if (url.pathname === "/servers") {
        const token = tokenFrom(req, url);
        if (!config.anonymous && token !== config.token) {
          send(401, { error: "unauthorized" });
          return;
        }
        send(200, { servers: await probeDevServers() });
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        const token = tokenFrom(req, url);
        if (!config.anonymous && token !== config.token) {
          send(401, { error: "unauthorized" });
          return;
        }
        if (!config.allowAnyPath && !isPathAllowed(url.pathname, url, roots)) {
          send(403, { error: "forbidden", message: "path outside of allowed project roots" });
          return;
        }
        await proxy(req, res, client, url);
        return;
      }

      send(404, { error: "not_found", path: url.pathname });
    } catch (err) {
      if (!res.headersSent) {
        send(502, { error: "bad_gateway", message: err instanceof Error ? err.message : String(err) });
      } else {
        res.end();
      }
    }
  };

  const server: Server =
    tls
      ? (createHttpsServer({ cert: tls.cert, key: tls.key }, requestHandler) as unknown as Server)
      : createServer(requestHandler);

  // --- Event WebSocket -------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true });

  const broadcast = (payload: unknown) => {
    const text = JSON.stringify(payload);
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(text);
    }
  };

  const ensureSubscription = () => {
    if (eventAbort) return;
    const controller = new AbortController();
    eventAbort = controller;
    void (async () => {
      let backoff = 500;
      while (!controller.signal.aborted) {
        try {
          await client.streamEvents(
            (event) => broadcast({ kind: "event", event }),
            controller.signal,
            () => {},
          );
          backoff = 500;
        } catch (err) {
          if (controller.signal.aborted) break;
          broadcast({ kind: "bridge", level: "warn", message: `event stream: ${err instanceof Error ? err.message : String(err)}` });
        }
        if (controller.signal.aborted) break;
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 10_000);
      }
    })();
  };

  const stopSubscriptionIfIdle = () => {
    if (eventClients === 0 && eventAbort) {
      eventAbort.abort();
      eventAbort = null;
    }
  };

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/events") {
      socket.destroy();
      return;
    }
    const token = tokenFrom(req, url);
    if (!config.anonymous && token !== config.token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket) => {
    sockets.add(ws);
    eventClients += 1;
    ensureSubscription();
    ws.send(JSON.stringify({
      kind: "hello",
      service: "opencode-remote-bridge",
      port,
      opencode: { url: client.baseUrl, version: info?.version, pid: info?.pid },
      time: Date.now(),
    }));
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.kind === "ping") ws.send(JSON.stringify({ kind: "pong", time: Date.now() }));
      } catch { /* ignore */ }
    });
    ws.on("close", () => {
      sockets.delete(ws);
      eventClients = Math.max(0, eventClients - 1);
      stopSubscriptionIfIdle();
    });
    ws.on("error", () => { /* handled by close */ });
  });

  const keepalive = setInterval(() => {
    const text = JSON.stringify({ kind: "ping", time: Date.now() });
    for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(text);
  }, 25_000);

  server.on("close", () => {
    clearInterval(keepalive);
    eventAbort?.abort();
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, config.host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({ server, port: actualPort, url: `http://${config.host}:${actualPort}` });
    });
  });
}

async function proxy(
  req: IncomingMessage,
  res: ServerResponse,
  client: OpenCodeClient,
  url: URL,
): Promise<void> {
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await readBody(req) : undefined;

  const headers: Record<string, string> = {};
  if (typeof req.headers["content-type"] === "string") headers["content-type"] = req.headers["content-type"];
  if (typeof req.headers["accept"] === "string") headers.accept = req.headers["accept"];
  Object.assign(headers, client.headers());

  const upstream = await fetch(client.url(url.pathname + url.search), {
    method,
    headers,
    body: body && body.length > 0 ? body : undefined,
  });

  const outHeaders: Record<string, string> = {};
  const contentType = upstream.headers.get("content-type");
  if (contentType) outHeaders["content-type"] = contentType;
  res.writeHead(upstream.status, outHeaders);
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.end(buf);
}
