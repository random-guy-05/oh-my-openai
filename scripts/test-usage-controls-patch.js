#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  STORE_KEY,
  assertTaskLimitWithoutRuntime,
  installUsageRuntime,
} = require("./patch-usage-controls");

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

global.localStorage = new MemoryStorage();
global.window = {
  prompt: () => null,
  alert: () => {},
};
delete global.__cdrUsageV1;

const runtime = installUsageRuntime();
assert.strictEqual(runtime, installUsageRuntime(), "runtime must be singleton");

const total = {
  inputTokens: 1000,
  cachedInputTokens: 750,
  outputTokens: 200,
  reasoningOutputTokens: 50,
  totalTokens: 1250,
};
const last = {
  inputTokens: 100,
  cachedInputTokens: 80,
  outputTokens: 20,
  reasoningOutputTokens: 5,
  totalTokens: 125,
};
const rows = [
  { bucket: { windowDurationMins: 300, usedPercent: 20, resetsAt: 100 } },
  {
    bucket: {
      windowDurationMins: 10080,
      usedPercent: 30,
      resetsAt: 200,
    },
  },
];
let store;

runtime.observe("thread-a", "server-a", { total, last, modelContextWindow: 200000 }, rows);
let summary = runtime.summary("thread-a");
assert.strictEqual(summary.usage.total.totalTokens, 1250);
assert.strictEqual(summary.hasExactUsage, true);
assert.strictEqual(summary.totalCachePercent, 75);
assert.strictEqual(summary.lastCachePercent, 80);
assert.strictEqual(summary.fiveHourDelta, 0);
assert.strictEqual(summary.weeklyDelta, 0);

runtime.observe("thread-a", "server-a", { total, last }, [
  { bucket: { windowDurationMins: 300, usedPercent: 23.5, resetsAt: 100 } },
  {
    bucket: {
      windowDurationMins: 10080,
      usedPercent: 37,
      resetsAt: 200,
    },
  },
]);
summary = runtime.summary("thread-a");
assert.strictEqual(summary.fiveHourDelta, 3.5);
assert.strictEqual(summary.weeklyDelta, 7);
const configuredAnswers = ["4", "8", "2000"];
global.window.prompt = () => configuredAnswers.shift();
runtime.configure("thread-a");
summary = runtime.summary("thread-a");
assert.strictEqual(
  summary.fiveHourDelta,
  3.5,
  "editing limits must not reset the task's observed 5-hour baseline",
);
assert.strictEqual(
  summary.weeklyDelta,
  7,
  "editing limits must not reset the task's observed weekly baseline",
);
global.window.prompt = () => null;

assert.strictEqual(
  runtime.summary("chat-linked").usage.total.totalTokens,
  0,
  "usage must be keyed only by the actual local task",
);
runtime.observe("thread-pending", null, null, rows);
const pendingSummary = runtime.summary("thread-pending");
assert.strictEqual(pendingSummary.hasExactUsage, false);
assert.strictEqual(pendingSummary.estimatedTranscriptTokens, null);
store = JSON.parse(localStorage.getItem(STORE_KEY));
store.threads["thread-pending"].config = {
  fiveHourPercent: null,
  weeklyPercent: null,
  maxTokens: 1,
};
localStorage.setItem(STORE_KEY, JSON.stringify(store));
assert.doesNotThrow(
  () => runtime.assertCanStart("thread-pending"),
  "exact token cap must wait for AppServer counters",
);

store = JSON.parse(localStorage.getItem(STORE_KEY));
store.threads["thread-a"].config = {
  fiveHourPercent: 3,
  weeklyPercent: 10,
  maxTokens: 2000,
};
localStorage.setItem(STORE_KEY, JSON.stringify(store));
assert.throws(() => runtime.assertCanStart("thread-a"), /5-hour usage cap reached/);
assert.throws(
  () => assertTaskLimitWithoutRuntime("thread-a"),
  /5-hour usage cap reached/,
);

store = JSON.parse(localStorage.getItem(STORE_KEY));
store.threads["thread-a"].config = {
  fiveHourPercent: null,
  weeklyPercent: null,
  maxTokens: 1200,
};
localStorage.setItem(STORE_KEY, JSON.stringify(store));
assert.throws(() => runtime.assertCanStart("thread-a"), /token usage cap reached/);

runtime.observe("thread-a", "server-a", { total, last }, [
  { bucket: { windowDurationMins: 300, usedPercent: 1, resetsAt: 101 } },
  {
    bucket: {
      windowDurationMins: 10080,
      usedPercent: 2,
      resetsAt: 201,
    },
  },
]);
summary = runtime.summary("thread-a");
assert.strictEqual(summary.fiveHourDelta, 0, "new 5-hour window must reset baseline");
assert.strictEqual(summary.weeklyDelta, 0, "new weekly window must reset baseline");

for (let index = 0; index < 140; index += 1) {
  runtime.observe(`thread-${index}`, null, { total: { totalTokens: index } }, []);
}
store = JSON.parse(localStorage.getItem(STORE_KEY));
assert.ok(
  Object.keys(store.threads).length <= 128,
  "persisted telemetry must have a bounded thread count",
);

console.log("[ok] usage runtime telemetry, cache ratios, quota deltas, caps, resets, and bounds");
