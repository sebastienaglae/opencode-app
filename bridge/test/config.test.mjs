import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, loadConfig } from "../src/config.ts";

test("parseArgs parses ports, flags and token", () => {
  const o = parseArgs(["--host", "0.0.0.0", "--ports", "1, 2 ,3", "--anonymous", "--token", "abc"]);
  assert.equal(o.host, "0.0.0.0");
  assert.deepEqual(o.ports, [1, 2, 3]);
  assert.equal(o.anonymous, true);
  assert.equal(o.token, "abc");
});

test("loadConfig reads the service file and persists the token", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-cfg-"));
  const serviceFile = join(dir, "service.json");
  writeFileSync(serviceFile, JSON.stringify({ url: "http://127.0.0.1:49374", password: "pw", version: "2.0.0" }));
  const configFile = join(dir, "config.json");
  const cfg = loadConfig({ serviceFile, configFile, token: "tok", host: "127.0.0.1", ports: [9] });
  assert.equal(cfg.opencodeUrl, "http://127.0.0.1:49374");
  assert.equal(cfg.opencodePassword, "pw");
  assert.equal(cfg.token, "tok");
  assert.deepEqual(cfg.ports, [9]);
  assert.equal(cfg.allowAnyPath, false);
});

test("loadConfig generates a token when none is provided", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-cfg2-"));
  const serviceFile = join(dir, "service.json");
  writeFileSync(serviceFile, JSON.stringify({ url: "http://127.0.0.1:1" }));
  const configFile = join(dir, "config.json");
  const cfg = loadConfig({ serviceFile, configFile });
  assert.ok(cfg.token.length >= 20);
});
