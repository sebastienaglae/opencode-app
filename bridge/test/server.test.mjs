import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBridge } from "../src/server.ts";

const client = {
  baseUrl: "http://127.0.0.1:1",
  url: (p) => "http://127.0.0.1:1" + p,
  headers: () => ({}),
  streamEvents: async () => {},
};

const baseConfig = {
  host: "127.0.0.1",
  ports: [],
  token: "tok",
  corsOrigin: "*",
  anonymous: false,
  allowAnyPath: false,
  configFile: "",
  opencodeUrl: "",
  opencodePassword: undefined,
  opencodeVersion: undefined,
};

test("health is public; /api requires a token; fs is scoped to project roots", async () => {
  const root = mkdtempSync(join(tmpdir(), "oc-root-"));
  const { server, port } = await startBridge(baseConfig, client, undefined, 0, [root]);
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);

    const unauth = await fetch(`${base}/api/info`);
    assert.equal(unauth.status, 401);

    const outside = await fetch(`${base}/api/fs/read/${encodeURIComponent("C:/Windows/win.ini")}`, {
      headers: { authorization: "Bearer tok" },
    });
    assert.equal(outside.status, 403);

    const inside = await fetch(`${base}/api/fs/list?path=${encodeURIComponent(root)}`, {
      headers: { authorization: "Bearer tok" },
    });
    assert.notEqual(inside.status, 403);
  } finally {
    server.close();
  }
});

test("anonymous mode allows /api without a token", async () => {
  const { server, port } = await startBridge({ ...baseConfig, anonymous: true }, client, undefined, 0, []);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/info`);
    assert.notEqual(res.status, 401);
  } finally {
    server.close();
  }
});
