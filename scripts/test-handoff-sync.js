#!/usr/bin/env node
"use strict";

/**
 * Logic tests for the bidirectional handoff runtime.
 *
 * These exercise the exact function that gets stringified into the bundle,
 * against a localStorage shim, so watermark and delta behaviour is proven
 * before anything is packed into an ASAR.
 */

const assert = require("assert");
const { installHandoffRuntime } = require("./_apply-handoff-sync-v1.js");

function freshRuntime() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.document = {
    documentElement: { getAttribute: () => null },
  };
  delete globalThis.__cdrHandoffV1;
  delete globalThis.__cdrLocalModeV4;
  return { rt: installHandoffRuntime(), store };
}

const KEY = "local:abc-123";
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("codex->chat delivers nothing when there is no transcript", () => {
  const { rt } = freshRuntime();
  assert.strictEqual(rt.pendingForChat(KEY), null);
});

test("codex->chat delivers the full transcript first, then only deltas", () => {
  const { rt } = freshRuntime();
  rt.recordCodex(KEY, ["User: build a parser", "Assistant: done"]);

  const first = rt.pendingForChat(KEY);
  assert.ok(first, "expected a pending handoff");
  assert.ok(first.text.includes("build a parser"));
  assert.ok(first.text.includes("<codex_transcript>"));
  assert.strictEqual(first.mark, 2);

  rt.commitChat(KEY, first.mark);
  assert.strictEqual(rt.pendingForChat(KEY), null, "committed turns must not resend");

  // This is the case the old `!continuing` gate got wrong: more Codex work
  // after the chat conversation already exists.
  rt.recordCodex(KEY, [
    "User: build a parser",
    "Assistant: done",
    "User: now add error recovery",
    "Assistant: added",
  ]);
  const second = rt.pendingForChat(KEY);
  assert.ok(second, "later codex work must reach an existing chat conversation");
  assert.ok(second.text.includes("error recovery"));
  assert.ok(!second.text.includes("build a parser"), "must send only the delta");
  assert.strictEqual(second.mark, 4);
});

test("chat->codex delivers new chat rows, then only deltas", () => {
  const { rt, store } = freshRuntime();
  store.set(
    "cdr-thread-extras:" + KEY,
    JSON.stringify([
      { role: "user", text: "what about timeouts?" },
      { role: "assistant", text: "use a 30s deadline" },
    ]),
  );

  const first = rt.pendingForCodex(KEY);
  assert.ok(first);
  assert.ok(first.text.includes("30s deadline"));
  assert.ok(first.text.includes("<chat_transcript>"));
  assert.strictEqual(first.mark, 2);

  rt.commitCodex(KEY, first.mark);
  assert.strictEqual(rt.pendingForCodex(KEY), null);

  store.set(
    "cdr-thread-extras:" + KEY,
    JSON.stringify([
      { role: "user", text: "what about timeouts?" },
      { role: "assistant", text: "use a 30s deadline" },
      { role: "user", text: "and retries?" },
    ]),
  );
  const second = rt.pendingForCodex(KEY);
  assert.ok(second);
  assert.ok(second.text.includes("and retries?"));
  assert.ok(!second.text.includes("30s deadline"), "must send only the delta");
});

test("the two directions have independent watermarks", () => {
  const { rt, store } = freshRuntime();
  rt.recordCodex(KEY, ["User: a", "Assistant: b"]);
  store.set(
    "cdr-thread-extras:" + KEY,
    JSON.stringify([{ role: "user", text: "c" }]),
  );

  rt.commitChat(KEY, rt.pendingForChat(KEY).mark);
  assert.strictEqual(rt.pendingForChat(KEY), null);
  assert.ok(rt.pendingForCodex(KEY), "committing one direction must not affect the other");
});

test("watermark survives a reload and is not re-sent", () => {
  const { rt, store } = freshRuntime();
  rt.recordCodex(KEY, ["User: persisted"]);
  rt.commitChat(KEY, rt.pendingForChat(KEY).mark);

  // Simulate an app restart: same backing store, brand new runtime.
  const saved = store.get("cdr-handoff-v1");
  delete globalThis.__cdrHandoffV1;
  const rt2 = installHandoffRuntime();
  assert.strictEqual(store.get("cdr-handoff-v1"), saved);
  assert.strictEqual(rt2.pendingForChat(KEY), null, "watermark must persist across restarts");
});

test("a shrinking transcript clamps the watermark instead of skipping turns", () => {
  const { rt } = freshRuntime();
  rt.recordCodex(KEY, ["User: a", "Assistant: b", "User: c"]);
  rt.commitChat(KEY, 3);
  rt.recordCodex(KEY, ["User: x"]);
  const pending = rt.pendingForChat(KEY);
  assert.ok(pending, "a re-render with fewer entries must not permanently mute the handoff");
  assert.ok(pending.text.includes("User: x"));
});

test("recordCodex is a no-op when the transcript is unchanged", () => {
  const { rt, store } = freshRuntime();
  rt.recordCodex(KEY, ["User: a"]);
  const before = store.get("cdr-handoff-v1");
  rt.recordCodex(KEY, ["User: a"]);
  assert.strictEqual(store.get("cdr-handoff-v1"), before, "must not write on every render");
});

test("isChatMode reads the mode runtime, then the DOM, then storage", () => {
  const { rt, store } = freshRuntime();
  assert.strictEqual(rt.isChatMode(), false);
  store.set("cdr-product-mode", "chat");
  assert.strictEqual(rt.isChatMode(), true);
  globalThis.__cdrLocalModeV4 = { mode: () => "codex" };
  assert.strictEqual(rt.isChatMode(), false, "mode runtime must win over storage");
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  [ok]   ${name}`);
  } catch (e) {
    failed++;
    console.error(`  [FAIL] ${name}\n         ${e.message}`);
  }
}
console.log(`\n== ${tests.length - failed}/${tests.length} handoff tests passed ==`);
process.exit(failed ? 1 : 0);
