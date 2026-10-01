import { createSseParser } from "./sse.ts";

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
    const reader = res.body.getReader();
    const feed = createSseParser(onEvent);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity?.();
      feed(decoder.decode(value, { stream: true }));
    }
  }
}
