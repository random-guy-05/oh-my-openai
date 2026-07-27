#!/usr/bin/env node
"use strict";

/**
 * Logic tests for per-turn usage attribution.
 *
 * The regression these exist for: the previous badge read one thread-level
 * counter and rendered it identically on every turn. The central assertion
 * here is that two different turns end up with two different readings, and
 * that a turn we never attributed anything to shows nothing at all.
 */

const assert = require("assert");
const { installTurnUsageRuntime } = require("./_apply-turn-usage-v2.js");

const KEY = "local:thread-1";

function harness() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (n, f) => listeners.set(n, [...(listeners.get(n) || []), f]),
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  };

  const state = { last: null, fiveHourDelta: 0, weeklyDelta: 0 };
  globalThis.__cdrUsageV1 = {
    summary: (k) =>
      k == null
        ? null
        : {
            usage: { last: state.last || { totalTokens: 0 }, total: { totalTokens: 0 } },
            fiveHourDelta: state.fiveHourDelta,
            weeklyDelta: state.weeklyDelta,
          },
  };

  delete globalThis.__cdrTurnUsageV1;
  const rt = installTurnUsageRuntime();
  return { rt, state, store };
}

const tokens = (t, extra = {}) => ({
  inputTokens: extra.in ?? 100,
  cachedInputTokens: extra.cached ?? 0,
  outputTokens: extra.out ?? 50,
  reasoningOutputTokens: extra.reason ?? 0,
  totalTokens: t,
});

const tests = [];
const test = (n, f) => tests.push([n, f]);

test("a turn with no attributed usage renders nothing", () => {
  const { rt } = harness();
  rt.reconcile(KEY, ["turn-a"]);
  assert.strictEqual(rt.get("turn-a"), null);
});

test("a completed turn is bound to the real AppServer reading", () => {
  const { rt, state } = harness();
  rt.reconcile(KEY, ["turn-a"]);
  state.last = tokens(1500);
  rt.reconcile(KEY, ["turn-a"]);
  const a = rt.get("turn-a");
  assert.ok(a, "turn-a should have a binding");
  assert.strictEqual(a.totalTokens, 1500);
});

test("two turns get two different readings", () => {
  const { rt, state } = harness();

  rt.reconcile(KEY, ["turn-a"]);
  state.last = tokens(1500);
  rt.reconcile(KEY, ["turn-a"]);

  rt.reconcile(KEY, ["turn-a", "turn-b"]);
  state.last = tokens(4200);
  rt.reconcile(KEY, ["turn-a", "turn-b"]);

  const a = rt.get("turn-a");
  const b = rt.get("turn-b");
  assert.strictEqual(a.totalTokens, 1500, "turn-a must keep its own reading");
  assert.strictEqual(b.totalTokens, 4200, "turn-b must get the newer reading");
  assert.notStrictEqual(a.totalTokens, b.totalTokens, "the original bug: identical numbers");
});

test("quota percentage is measured across the turn, not since task start", () => {
  const { rt, state } = harness();
  state.fiveHourDelta = 5;
  state.weeklyDelta = 2;
  rt.reconcile(KEY, ["turn-a"]);

  state.fiveHourDelta = 6.5;
  state.weeklyDelta = 2.25;
  state.last = tokens(1000);
  rt.reconcile(KEY, ["turn-a"]);

  const a = rt.get("turn-a");
  assert.ok(Math.abs(a.fiveHourDelta - 1.5) < 1e-9, `expected 1.5, got ${a.fiveHourDelta}`);
  assert.ok(Math.abs(a.weeklyDelta - 0.25) < 1e-9, `expected 0.25, got ${a.weeklyDelta}`);
});

test("an unchanged usage reading is not re-attributed to a later turn", () => {
  const { rt, state } = harness();
  rt.reconcile(KEY, ["turn-a"]);
  state.last = tokens(900);
  rt.reconcile(KEY, ["turn-a"]);

  rt.reconcile(KEY, ["turn-a", "turn-b"]);
  rt.reconcile(KEY, ["turn-a", "turn-b"]); // same usage.last, no new turn completed
  assert.strictEqual(rt.get("turn-b"), null, "turn-b must stay blank until it completes");
  assert.strictEqual(rt.get("turn-a").totalTokens, 900);
});

test("bindings persist across a reload", () => {
  const { rt, state, store } = harness();
  rt.reconcile(KEY, ["turn-a"]);
  state.last = tokens(2222);
  rt.reconcile(KEY, ["turn-a"]);

  const saved = store.get("cdr-turn-usage-v1");
  delete globalThis.__cdrTurnUsageV1;
  const rt2 = installTurnUsageRuntime();
  assert.strictEqual(store.get("cdr-turn-usage-v1"), saved);
  assert.strictEqual(rt2.get("turn-a").totalTokens, 2222);
});

test("a zero-token reading is never attributed", () => {
  const { rt, state } = harness();
  rt.reconcile(KEY, ["turn-a"]);
  state.last = tokens(0);
  rt.reconcile(KEY, ["turn-a"]);
  assert.strictEqual(rt.get("turn-a"), null);
});

test("turns from a thread with no usage data stay blank", () => {
  const { rt } = harness();
  globalThis.__cdrUsageV1 = { summary: () => null };
  rt.reconcile("local:unknown", ["turn-z"]);
  assert.strictEqual(rt.get("turn-z"), null);
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
console.log(`\n== ${tests.length - failed}/${tests.length} turn-usage tests passed ==`);
process.exit(failed ? 1 : 0);
