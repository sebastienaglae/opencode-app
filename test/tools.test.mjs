import { test } from "node:test";
import assert from "node:assert/strict";
import { toolLabelKey, toolSummary, toolFields } from "../src/core/tools.ts";

const shell = {
  type: "tool",
  id: "1",
  name: "shell",
  state: { status: "completed", input: { command: "ls -la" }, content: [{ type: "text", text: "ok" }] },
  time: { created: 0 },
};

test("toolLabelKey maps known tools", () => {
  assert.equal(toolLabelKey("shell"), "tool.shell");
  assert.equal(toolLabelKey("read"), "tool.read");
  assert.equal(toolLabelKey("unknown"), "tool.other");
});

test("toolSummary extracts the command", () => {
  assert.equal(toolSummary(shell), "ls -la");
});

test("toolFields maps shell to a command field (no raw JSON)", () => {
  const f = toolFields(shell);
  assert.equal(f[0].labelKey, "tool.command");
  assert.equal(f[0].value, "ls -la");
  assert.ok(!JSON.stringify(f).includes('{"command"'));
});

test("toolFields builds a diff for edit", () => {
  const edit = {
    type: "tool",
    id: "2",
    name: "edit",
    state: { status: "completed", input: { filePath: "src/a.ts", oldString: "a", newString: "b" }, content: [] },
    time: { created: 0 },
  };
  const f = toolFields(edit);
  assert.equal(f.find((x) => x.labelKey === "tool.file").value, "src/a.ts");
  assert.equal(f.find((x) => x.labelKey === "tool.diff").value, "-a\n+b");
});

test("toolFields parses streaming JSON input", () => {
  const streaming = { type: "tool", id: "3", name: "read", state: { status: "streaming", input: '{"filePath":"x.ts"}' }, time: { created: 0 } };
  assert.equal(toolFields(streaming)[0].value, "x.ts");
});
