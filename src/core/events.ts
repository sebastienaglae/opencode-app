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
    this.open();
  }

  disconnect(): void {
    this.closedByUser = true;
    this.url = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.setStatus("idle");
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
      this.setStatus("open");
    };

    ws.onmessage = (ev) => {
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
