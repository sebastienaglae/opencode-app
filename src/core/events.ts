import type { OpenCodeEvent } from "./types";

export type EventStreamStatus = "idle" | "connecting" | "open" | "closed";

type EventHandler = (event: OpenCodeEvent) => void;
type StatusHandler = (status: EventStreamStatus) => void;

/**
 * WebSocket client for the companion bridge event stream.
 * Events are live-only; consumers must resync via REST after reconnecting.
 */
class EventStream {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private handlers = new Set<EventHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private attempt = 0;
  private closedByUser = false;
  private status: EventStreamStatus = "idle";

  connect(host: string, port: number, token: string, secure = false): void {
    const scheme = secure ? "wss" : "ws";
    const url = `${scheme}://${host}:${port}/events${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    if (this.url === url && (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.url = url;
    this.closedByUser = false;
    this.startWatchdog();
    this.open();
  }

  disconnect(): void {
    this.closedByUser = true;
    this.url = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopWatchdog();
    this.ws?.close();
    this.ws = null;
    this.setStatus("idle");
  }

  /** A phone that sleeps or roams can keep a WebSocket in OPEN state while it
   *  is already dead. The bridge pings every 25s; silence for 70s means the
   *  socket must be replaced. */
  private startWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastMessageAt < 70_000) return;
      this.dropSocket();
    }, 20_000);
  }

  private stopWatchdog(): void {
    if (!this.watchdog) return;
    clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private dropSocket(): void {
    const dead = this.ws;
    this.ws = null;
    if (dead) {
      dead.onopen = null;
      dead.onmessage = null;
      dead.onclose = null;
      dead.onerror = null;
      try {
        dead.close();
      } catch {
        /* already gone */
      }
    }
    this.setStatus("closed");
    this.scheduleReconnect();
  }

  onEvent(cb: EventHandler): () => void {
    this.handlers.add(cb);
    return () => this.handlers.delete(cb);
  }

  onStatus(cb: StatusHandler): () => void {
    this.statusHandlers.add(cb);
    cb(this.status);
    return () => this.statusHandlers.delete(cb);
  }

  getStatus(): EventStreamStatus {
    return this.status;
  }

  private setStatus(status: EventStreamStatus): void {
    this.status = status;
    for (const cb of this.statusHandlers) cb(status);
  }

  private open(): void {
    if (!this.url) return;
    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("open");
    };

    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      let msg: { kind?: string; event?: OpenCodeEvent; level?: string; message?: string };
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (msg.kind === "event" && msg.event) {
        for (const cb of this.handlers) cb(msg.event);
      } else if (msg.kind === "hello") {
        for (const cb of this.handlers) cb({ type: "server.connected", data: {} });
      } else if (msg.kind === "bridge" && msg.level === "warn") {
        console.warn("[bridge]", msg.message);
      }
    };

    ws.onclose = () => {
      this.setStatus("closed");
      if (!this.closedByUser) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose handles reconnect
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || !this.url) return;
    const delay = Math.min(500 * 2 ** this.attempt, 10_000);
    this.attempt += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }
}

export const eventStream = new EventStream();
