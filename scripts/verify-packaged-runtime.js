#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const asar = require("@electron/asar");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const archive =
  process.argv[2] ||
  path.join(ROOT, "out", "mac-x64", "Codex.app", "Contents", "Resources", "app.asar");

assert.ok(fs.existsSync(archive), `missing packaged ASAR: ${archive}`);
const entries = asar.listPackage(archive).map((entry) => entry.replace(/^\//, ""));
const mainName = entries.find((entry) =>
  /^webview\/assets\/app-initial-.*\.js$/.test(entry),
);
const threadName = entries.find((entry) =>
  /^webview\/assets\/local-conversation-thread-.*\.js$/.test(entry),
);
assert.ok(mainName, "packaged renderer bundle is missing");
assert.ok(threadName, "packaged local-thread bundle is missing");

const main = asar.extractFile(archive, mainName).toString("utf8");
const thread = asar.extractFile(archive, threadName).toString("utf8");
acorn.parse(main, { ecmaVersion: "latest", sourceType: "module" });
acorn.parse(thread, { ecmaVersion: "latest", sourceType: "module" });

for (const [needle, label] of [
  ["codex-rebuild:local-canonical-selector-v3", "same-task mode selector"],
  ["client.startCompletionStream({", "ChatGPT Web stream transport"],
  ["CDRMergeChatModels", "signed-in ChatGPT model catalog"],
  ["codex-rebuild:mode-ui-invariants-v1:mode-nav", "mode navigation handler"],
  ["children:n?`ChatGPT`:`ChatGPT`", "ChatGPT label"],
  ["CDRObserver=new MutationObserver(CDRMarkSend)", "send-button color remount support"],
  ["modelControllers.add(controller);\n    return () => modelControllers.delete(controller);", "render-safe model registration"],
  ["detail:{key,rows:Array.isArray(rows)?rows:null}", "immediate Chat row publication"],
  ["d.message.end_turn===true", "Chat terminal lifecycle"],
]) {
  assert.ok(main.includes(needle), `packaged runtime missing ${label}`);
}

for (const [needle, label] of [
  ["CDRDetail?.key&&CDRDetail.key!==CDRKey", "task-scoped Chat updates"],
  ["CDRDurableLast>=CDRLocalLast", "stale Chat history guard"],
]) {
  assert.ok(thread.includes(needle), `packaged runtime missing ${label}`);
}

assert.ok(!main.includes("const current = mode();"), "packaged runtime contains recursive formatted model registration");
assert.ok(!main.includes("let current=mode()"), "packaged runtime contains recursive minified model registration");

const digest = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
console.log(`[ok] packaged runtime parse, custom markers, and React recursion guard passed (${digest})`);
