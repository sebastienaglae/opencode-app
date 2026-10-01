/** Minimal HTTP client for the local OpenCode V2 service. */

export type OpenCodeInfo = {
  version: string;
  pid: number;
  urls: string[];
  paths: { tmp: string };
};

export class OpenCodeClient {
  readonly baseUrl: string;
  private readonly authHeader?: string;

  constructor(baseUrl: string, password?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    if (password) {
      this.authHeader =
        "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
    }
  }

  headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.authHeader) headers.authorization = this.authHeader;
    return headers;
  }

  info(signal?: AbortSignal): Promise<OpenCodeInfo> {
    return this.get<OpenCodeInfo>("/api/info", signal);
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(this.baseUrl + path, { headers: this.headers(), signal });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return (await res.json()) as T;
  }

  url(path: string): string {
    return this.baseUrl + path;
  }

  /**
   * Subscribe to the OpenCode event stream (SSE) and invoke `onEvent` for every
   * decoded JSON event. Resolves when the stream ends or the signal aborts.
   */
  async streamEvents(
    onEvent: (event: unknown) => void,
    signal: AbortSignal,
    onActivity?: () => void,
  ): Promise<void> {
    const res = await fetch(this.url("/api/event"), {
      headers: this.headers({ accept: "text/event-stream" }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`event stream -> ${res.status}`);

    const decoder = new TextDecoder();
    let buffer = "";
    const reader = res.body.getReader();
    let eventName: string | null = null;
    const dataLines: string[] = [];

    const flush = () => {
      if (dataLines.length === 0) { eventName = null; return; }
      const raw = dataLines.join("\n");
      dataLines.length = 0;
      const name = eventName;
      eventName = null;
      if (!raw.trim()) return;
      try {
        onEvent(JSON.parse(raw));
      } catch {
        onEvent({ type: name ?? "raw", data: raw });
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity?.();
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line === "") { flush(); continue; }
        if (line.startsWith(":")) continue; // comment / keepalive
        const colon = line.indexOf(":");
        const field = colon >= 0 ? line.slice(0, colon) : line;
        let val = colon >= 0 ? line.slice(colon + 1) : "";
        if (val.startsWith(" ")) val = val.slice(1);
        if (field === "event") eventName = val;
        else if (field === "data") dataLines.push(val);
      }
    }
  }
}
