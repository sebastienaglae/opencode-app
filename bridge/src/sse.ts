/** Incremental Server-Sent Events parser. Feed it decoded text chunks; it
 *  invokes `onEvent` for each complete event's JSON payload. */
export function createSseParser(onEvent: (payload: unknown) => void): (chunk: string) => void {
  let buffer = "";
  let eventName: string | null = null;
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      eventName = null;
      return;
    }
    const raw = dataLines.join("\n");
    dataLines = [];
    const name = eventName;
    eventName = null;
    if (!raw.trim()) return;
    try {
      onEvent(JSON.parse(raw));
    } catch {
      onEvent({ type: name ?? "raw", data: raw });
    }
  };

  return (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") {
        flush();
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon >= 0 ? line.slice(0, colon) : line;
      let val = colon >= 0 ? line.slice(colon + 1) : "";
      if (val.startsWith(" ")) val = val.slice(1);
      if (field === "event") eventName = val;
      else if (field === "data") dataLines.push(val);
    }
  };
}
