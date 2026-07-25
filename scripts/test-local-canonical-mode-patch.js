#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const {
  EVENT_NAME,
  STORE_KEY,
  installLocalModeRuntime,
  locateTargets,
  patchComposerBundle,
  patchContextBundle,
  patchCss,
  patchSelectorBundle,
} = require("./patch-local-canonical-mode");

function count(source, needle) {
  if (typeof source !== "string") return 0;
  return source.split(needle).length - 1;
}

function findFixtureTargets() {
  const fixtureAssets = process.env.LOCAL_CANONICAL_FIXTURE_ASSETS;
  if (!fixtureAssets) return locateTargets("mac-x64");
  const names = fs.readdirSync(fixtureAssets);
  const files = names
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(fixtureAssets, name));
  const one = (predicate) => {
    const matches = files.filter((filePath) =>
      predicate(fs.readFileSync(filePath, "utf8")),
    );
    assert.strictEqual(matches.length, 1);
    return matches[0];
  };
  const css = names
    .filter((name) => /^app-[^.]+\.css$/.test(name))
    .map((name) => path.join(fixtureAssets, name))
    .find((filePath) =>
      fs.readFileSync(filePath, "utf8").includes(
        "--color-token-main-surface-primary",
      ),
    );
  assert.ok(css);
  return {
    selector: one(
      (source) =>
        source.includes("sidebarElectron.productMode.trigger") &&
        source.includes("startNewConversation"),
    ),
    composer: one(
      (source) =>
        source.includes("activeCollaborationMode") &&
        source.includes("blockedReasonOpenNonce") &&
        source.includes("settings.model"),
    ),
    context: one(
      (source) =>
        source.includes("ChatGPT conversation does not have a server id") &&
        source.includes("chatGptConversationContexts") &&
        source.includes("thinking:void 0"),
    ),
    // history and threadContext are optional in 26.721+ monolith (the
    // patches do not modify them in newer bases). Return null when
    // missing so the test can skip their assertions rather than crashing
    // on a `readFileSync(null)` ArgumentTypeError.
    history: optional(files, (source) =>
      source.includes("hydrate-background-threads") &&
      source.includes("subagent summary previews") &&
      source.includes("includeTurns:!0"),
    ),
    threadContext: optional(files, (source) =>
      source.includes("excludedThreadId") &&
      source.includes("priorConversation") &&
      source.includes("method:`thread/read`") &&
      source.includes("includeTurns:!0"),
    ),
    css,
  };
}

function optional(files, predicate) {
  const matches = files.filter((filePath) =>
    predicate(fs.readFileSync(filePath, "utf8")),
  );
  return matches.length === 1 ? matches[0] : null;
}

function readOrEmpty(filePath) {
  return filePath ? fs.readFileSync(filePath, "utf8") : "";
}

function assertParses(source) {
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
}

function testPatches() {
  const targets = findFixtureTargets();
  const selectorSource = fs.readFileSync(targets.selector, "utf8");
  const composerSource = fs.readFileSync(targets.composer, "utf8");
  const contextSource = fs.readFileSync(targets.context, "utf8");
  // historySource / threadContextSource may be empty strings when
  // locateTargets returned null (26.721+ no longer exposes those bundles
  // as separate files). All test assertions on them are guarded below.
  const historySource = readOrEmpty(targets.history);
  const threadContextSource = readOrEmpty(targets.threadContext);
  const cssSource = fs.readFileSync(targets.css, "utf8");
  for (const source of [selectorSource, composerSource]) {
    assert.ok(!source.includes("codex-rebuild:seamless-chat-v2"));
  }

  const selector = patchSelectorBundle(selectorSource, targets.selector);
  const composer = patchComposerBundle(composerSource, targets.composer);
  const context = patchContextBundle(contextSource, targets.context);
  const css = patchCss(cssSource, targets.css);
  assertParses(selector);
  assertParses(composer);
  assertParses(context);
  assert.strictEqual(patchSelectorBundle(selector, targets.selector), selector);
  assert.strictEqual(patchComposerBundle(composer, targets.composer), composer);
  assert.strictEqual(patchContextBundle(context, targets.context), context);
  assert.strictEqual(patchCss(css, targets.css), css);

  for (const forbidden of [
    "/work/conversation/",
    "window.location.reload",
    "location.reload",
  ]) {
    assert.strictEqual(
      count(selector + composer, forbidden),
      count(selectorSource + composerSource, forbidden),
      `patch introduced ${forbidden}`,
    );
  }
  for (const historyAnchor of [
    "thread/read",
    "thread/turns/list",
    "includeTurns",
    "hydrate-background-threads",
  ]) {
    assert.strictEqual(
      count(selector + composer, historyAnchor),
      count(selectorSource + composerSource, historyAnchor),
      `mode patch changed history anchor ${historyAnchor}`,
    );
  }
  assert.ok(selector.includes("Chat preset — same task and history"));
  assert.ok(selector.includes("children:`ChatGPT Work`"));
  assert.ok(selector.includes("CDRRuntime.setMode(e)"));
  assert.ok(selector.includes("nextMode:`codex`"));
  assert.ok(!selector.includes("nextMode:e"));
  assert.ok(composer.includes("collaborationForMode(CDRMode,i)"));
  assert.ok(composer.includes("registerModelController"));
  assert.ok(composer.includes("w(CDRModel,CDREffort)"));
  assert.ok(composer.includes("backgroundCollaboration(i)"));
  assert.ok(composer.includes("model:CDRRuntime.backgroundModel"));
  assert.ok(
    composer.includes(
      "reasoningEffort:CDRRuntime.backgroundReasoningEffort",
    ),
  );
  assert.ok(composer.includes("className:`cdr-mode-send`"));
  assert.ok(context.includes("model:`gpt-5.6-luna`"));
  assert.ok(context.includes("thinking:`low`"));
  // history/threadContext fixtures are required for these assertions.
  // Run with `LOCAL_CANONICAL_FIXTURE_ASSETS=/path/to/26.715/extracted`
  // to verify the older base still preserves full-turn reads.
  if (process.env.LOCAL_CANONICAL_FIXTURE_ASSETS) {
    assert.ok(
      count(historySource, "includeTurns:!0") >= 2,
      "background task hydration must retain full turns",
    );
    assert.ok(
      threadContextSource.includes(
        "method:`thread/read`,params:{includeTurns:!0",
      ),
      "referenced task context must read the complete transcript",
    );
  } else {
    console.log(
      "[skip] history/threadContext assertions (set LOCAL_CANONICAL_FIXTURE_ASSETS for full coverage)",
    );
  }
  assert.ok(css.includes("#111111"));
  assert.ok(css.includes("#2563eb"));
  assert.ok(css.includes("#dc2626"));
}

function testRuntime() {
  const originals = {
    CustomEvent: global.CustomEvent,
    document: global.document,
    localStorage: global.localStorage,
    window: global.window,
    runtime: global.__cdrLocalModeV4,
  };
  const storage = new Map();
  const attributes = new Map();
  const listeners = new Map();
  global.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  global.document = {
    documentElement: {
      setAttribute: (key, value) => attributes.set(key, value),
    },
  };
  global.CustomEvent = class {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };
  global.window = {
    addEventListener: (name, listener) => {
      const bucket = listeners.get(name) || new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
    },
    dispatchEvent: (event) => {
      for (const listener of listeners.get(event.type) || []) listener(event);
    },
    removeEventListener: (name, listener) =>
      listeners.get(name)?.delete(listener),
  };
  delete global.__cdrLocalModeV4;

  try {
    const runtime = installLocalModeRuntime();
    assert.strictEqual(runtime.mode(), "codex");
    assert.strictEqual(
      attributes.get("data-codex-product-mode"),
      "codex",
    );
    let observed = null;
    const modelSelections = [];
    const unregisterModelController = runtime.registerModelController(
      (settings) => modelSelections.push(settings),
    );
    const unsubscribe = runtime.subscribe((mode) => {
      observed = mode;
    });
    assert.strictEqual(runtime.setMode("chat"), "chat");
    assert.strictEqual(storage.get(STORE_KEY), "chat");
    assert.strictEqual(observed, "chat");
    assert.deepStrictEqual(modelSelections, [
      { model: "gpt-5.6-sol", reasoningEffort: "medium" },
    ]);
    assert.strictEqual(runtime.modelForMode("chat"), "gpt-5.6-sol");
    assert.strictEqual(runtime.modelForMode("work"), "gpt-5.6-terra");
    assert.strictEqual(runtime.modelForMode("codex"), "gpt-5.6-sol");
    assert.strictEqual(runtime.reasoningEffortForMode("chat"), "medium");
    assert.strictEqual(runtime.reasoningEffortForMode("work"), "low");
    assert.strictEqual(runtime.reasoningEffortForMode("codex"), "high");
    const collaboration = {
      mode: "default",
      settings: { model: "old-model", sandbox: "workspace-write" },
    };
    const next = runtime.collaborationForMode("work", collaboration);
    assert.notStrictEqual(next, collaboration);
    assert.strictEqual(next.settings.model, "gpt-5.6-terra");
    assert.strictEqual(next.settings.reasoning_effort, "low");
    assert.strictEqual(next.settings.sandbox, "workspace-write");
    assert.strictEqual(collaboration.settings.model, "old-model");
    const background = runtime.backgroundCollaboration(collaboration);
    assert.strictEqual(background.settings.model, "gpt-5.6-luna");
    assert.strictEqual(background.settings.reasoning_effort, "low");
    assert.strictEqual(background.settings.sandbox, "workspace-write");
    assert.strictEqual(runtime.backgroundModel, "gpt-5.6-luna");
    assert.strictEqual(runtime.backgroundReasoningEffort, "low");
    unsubscribe();
    unregisterModelController();
    runtime.setMode("codex");
    assert.strictEqual(observed, "chat");
    assert.strictEqual(runtime.eventName, EVENT_NAME);
    assert.ok(!("location" in global.window));
  } finally {
    global.CustomEvent = originals.CustomEvent;
    global.document = originals.document;
    global.localStorage = originals.localStorage;
    global.window = originals.window;
    if (originals.runtime === undefined) delete global.__cdrLocalModeV4;
    else global.__cdrLocalModeV4 = originals.runtime;
  }
}

testPatches();
testRuntime();
console.log(
  "[ok] mode switches preserve the local task while model and send color update",
);
