import { test } from "node:test";
import assert from "node:assert/strict";
import { createSseParser } from "../src/sse.ts";

test("parses a simple data event", () => {
  const events = [];
  const feed = createSseParser((e) => events.push(e));
  feed('data: {"type":"a"}\n\n');
  assert.deepEqual(events, [{ type: "a" }]);
});

test("handles events split across chunks and CRLF", () => {
  const events = [];
  const feed = createSseParser((e) => events.push(e));
  feed('data: {"ty');
  feed('pe":"b"}\r\n\r\n');
  assert.deepEqual(events, [{ type: "b" }]);
});

test("ignores comments/keepalives and handles multiple events", () => {
  const events = [];
  const feed = createSseParser((e) => events.push(e));
  feed(": keepalive\n\n");
  feed('event: message\ndata: {"type":"c"}\n\n');
  feed('data: {"type":"d"}\n\n');
  assert.deepEqual(events, [{ type: "c" }, { type: "d" }]);
});

test("joins multi-line data and falls back on invalid JSON", () => {
  const events = [];
  const feed = createSseParser((e) => events.push(e));
  feed('data: {"type":"e",\ndata: "n":1}\n\n');
  assert.deepEqual(events, [{ type: "e", n: 1 }]);

  const raw = [];
  const feed2 = createSseParser((e) => raw.push(e));
  feed2("event: ping\ndata: not-json\n\n");
  assert.deepEqual(raw, [{ type: "ping", data: "not-json" }]);
});
