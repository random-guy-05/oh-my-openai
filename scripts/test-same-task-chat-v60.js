#!/usr/bin/env node
"use strict";

const assert = require("assert");
const vm = require("vm");
const { BRIDGE, CATALOG_BUILDER, TASK_USAGE_BADGE } = require("./_apply-same-task-chat-v60");

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

async function main() {
  let usageListener = null;
  const badgeContext = {
    hT: {
      useState: () => [0, () => {}],
      useEffect: (effect) => { effect(); },
    },
    gT: { jsx: (type, props) => ({ type, props }) },
    window: {
      addEventListener: (name, listener) => { if (name === "cdr-usage-change") usageListener = listener; },
      removeEventListener() {},
    },
    __cdrUsageV1: {
      summary: () => ({
        fiveHourDelta: 3.5,
        weeklyDelta: 7,
        hasExactUsage: true,
        usage: { total: { totalTokens: 1250 } },
      }),
    },
  };
  badgeContext.globalThis = badgeContext;
  vm.createContext(badgeContext);
  vm.runInContext(`${TASK_USAGE_BADGE};globalThis.__testBadge=CDRTaskUsageBadge;`, badgeContext);
  const badge = badgeContext.__testBadge({ threadId: "thread-a" });
  assert.strictEqual(badge.props.children[1].props.children, "5h +3.5% · 7d +7.0% · 1,250 tokens");
  assert.strictEqual(typeof usageListener, "function", "usage badge must subscribe to live telemetry");
  badgeContext.__cdrLocalModeV4 = { mode: () => "chat" };
  assert.strictEqual(
    badgeContext.__testBadge({ threadId: "thread-a" }),
    null,
    "Codex task usage must not be presented as Chat usage",
  );

  const catalogStorage = new MemoryStorage();
  catalogStorage.setItem("cdr-chat-model-selection", "chat:obsolete:extended");
  const catalogContext = {
    console,
    localStorage: catalogStorage,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    window: { dispatchEvent() {} },
    __cdrChatRawModels: [
      { slug: "gpt-5-5", title: "GPT-5.5" },
      { slug: "gpt-5-6-thinking", title: "GPT-5.6 Thinking" },
      { slug: "gpt-5-5-thinking", title: "GPT-5.5 Thinking" },
    ],
  };
  catalogContext.globalThis = catalogContext;
  vm.createContext(catalogContext);
  vm.runInContext(`${CATALOG_BUILDER};globalThis.__testCatalog=CDRMergeChatModels;`, catalogContext);
  catalogContext.__testCatalog({
    defaultModelSlug: "gpt-5-5",
    options: [
      { slug: "gpt-5-5", title: "Instant", selectedLabel: "Instant", lane: "instant" },
      { slug: "gpt-5-6-thinking", title: "Medium", selectedLabel: "Medium", thinkingEffort: "standard", lane: "thinking" },
      { slug: "gpt-5-6-thinking", title: "High", selectedLabel: "High", thinkingEffort: "extended", lane: "thinking" },
    ],
    versionOptions: [
      {
        id: "latest",
        label: "GPT-5.6 Sol",
        options: [
          { slug: "gpt-5-5", title: "Instant", selectedLabel: "Instant", lane: "instant" },
          { slug: "gpt-5-6-thinking", title: "Medium", selectedLabel: "Medium", thinkingEffort: "standard", lane: "thinking" },
          { slug: "gpt-5-6-thinking", title: "High", selectedLabel: "High", thinkingEffort: "extended", lane: "thinking" },
        ],
      },
      {
        id: "5.5",
        label: "GPT-5.5",
        options: [
          { slug: "gpt-5-5", title: "Instant", selectedLabel: "Instant", lane: "instant" },
          { slug: "gpt-5-5-thinking", title: "High", selectedLabel: "High", thinkingEffort: "extended", lane: "thinking" },
        ],
      },
    ],
  });
  assert.deepStrictEqual(
    Array.from(catalogContext.__cdrChatPowerRows, (row) => row.modelLabel),
    ["GPT-5.5 Instant", "GPT-5.6 Sol Medium", "GPT-5.6 Sol High"],
  );
  assert.strictEqual(catalogContext.__cdrChatPowerRows.length, 3, "historical options leaked into active choices");
  assert.strictEqual(catalogContext.__cdrChatSelectedModel, "chat:gpt-5-5:none");
  assert(catalogContext.__cdrChatPowerRows.every((row) => row.reasoningEffort === "none"));

  const localStorage = new MemoryStorage();
  const requests = [];
  let call = 0;
  const client = {
    startCompletionStream(options) {
      requests.push(options.request);
      call++;
      if (call === 1) {
        options.onUpdate({
          type: "message",
          conversationId: "conversation-1",
          message: { id: "assistant-1", content: { parts: ["partial"] } },
        });
        options.onUpdate({
          type: "message",
          conversationId: "conversation-1",
          message: { id: "assistant-1", content: { parts: ["complete answer"] } },
        });
      } else {
        options.onUpdate({
          type: "message",
          conversationId: "conversation-1",
          message: { id: "assistant-2", content: { parts: ["second answer"] } },
        });
      }
      options.onComplete();
    },
  };
  let uuid = 0;
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Intl,
    Date,
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage,
    document: { documentElement: { getAttribute: () => "chat" } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    window: { dispatchEvent() {} },
    __cdrLocalModeV4: { mode: () => "chat" },
    __cdrChatClient: client,
    __cdrChatPowerRows: [{
      id: "logical-high",
      model: "logical-high",
      apiModel: "real-chat-model",
      apiEffort: "extended",
      modelLabel: "Real Chat Model High",
    }],
    __cdrChatDefaultSlug: "logical-high",
    __cdrChatSelectedModel: "logical-high",
    __cdrCodexContextByThread: {
      "local:task-1": { text: "authoritative-context-" + "x".repeat(50000) },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${BRIDGE};globalThis.__testBridge=CDRStickyChatSend;`, context);

  const longUserMessage = "user-" + "y".repeat(20000);
  const first = await context.__testBridge({}, "task-1", { input: longUserMessage });
  assert.strictEqual(first, true);
  assert.strictEqual(requests[0].model, "real-chat-model");
  assert.strictEqual(requests[0].thinking_effort, "extended");
  assert.strictEqual(requests[0].conversation_id, undefined);
  assert(requests[0].messages[0].content.parts[0].includes("x".repeat(50000)), "full Codex context was truncated");
  assert(requests[0].messages[0].content.parts[0].includes(longUserMessage), "full user message was truncated");

  let extras = JSON.parse(localStorage.getItem("cdr-thread-extras:local:task-1"));
  assert.strictEqual(extras[0].text, longUserMessage);
  assert.strictEqual(extras.filter((row) => row.role === "assistant").length, 1);
  assert.strictEqual(extras.find((row) => row.role === "assistant").text, "complete answer");

  let state = JSON.parse(localStorage.getItem("cdr-chat-thread-state-v1"));
  assert.deepStrictEqual(
    { conversationId: state.byLocal["local:task-1"].conversationId, parentMessageId: state.byLocal["local:task-1"].parentMessageId },
    { conversationId: "conversation-1", parentMessageId: "assistant-1" },
  );

  const second = await context.__testBridge({}, "task-1", { input: "follow up" });
  assert.strictEqual(second, true);
  assert.strictEqual(requests[1].conversation_id, "conversation-1");
  assert.strictEqual(requests[1].parent_message_id, "assistant-1");
  assert.strictEqual(requests[1].messages[0].content.parts[0], "follow up");
  extras = JSON.parse(localStorage.getItem("cdr-thread-extras:local:task-1"));
  assert.strictEqual(extras.at(-1).text, "second answer");
  assert(!extras.at(-1).text.includes("partial"), "snapshot updates were appended as deltas");

  console.log("[ok] authoritative active Chat models, native flattened labels, full context, snapshot streaming, and real continuation");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
