import { test } from "node:test";
import assert from "node:assert/strict";
import { setFormatLocale, formatRelative, formatCost, formatDuration, formatTokens, formatUsage } from "../src/core/format.ts";

test("formatRelative is localized (en/fr)", () => {
  const ts = Date.now() - 37 * 60 * 1000;
  setFormatLocale("en");
  assert.match(formatRelative(ts), /37 minutes ago/);
  setFormatLocale("fr");
  assert.match(formatRelative(ts), /il y a 37 minutes/);
  setFormatLocale("fr");
});

test("formatTokens compacts large numbers", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(1500), "1.5k");
  assert.equal(formatTokens(2_500_000), "2.50M");
});

test("formatCost uses the locale currency format", () => {
  setFormatLocale("en");
  assert.match(formatCost(0.1234), /\$0\.123/);
  assert.match(formatCost(2.5), /\$2\.50/);
});

test("formatDuration formats ms/s/m", () => {
  assert.equal(formatDuration(500), "500 ms");
  assert.equal(formatDuration(1500), "1.5 s");
  assert.equal(formatDuration(90_000), "1m 30s");
});

test("formatUsage uses translated labels", () => {
  const t = (k) => ({ "usage.in": "in", "usage.out": "out", "usage.reason": "reason", "usage.cache": "cache" })[k] ?? k;
  const s = formatUsage({ input: 1000, output: 20, reasoning: 5, cache: { read: 300, write: 10 } }, t);
  assert.match(s, /in 1.0k/);
  assert.match(s, /out 20/);
  assert.match(s, /reason 5/);
  assert.match(s, /cache 300\/10/);
});
