#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");

function asset(part) {
  const name = fs.readdirSync(ASSETS).find((file) => file.includes(part) && file.endsWith(".js"));
  assert.ok(name, `missing ${part}`);
  return fs.readFileSync(path.join(ASSETS, name), "utf8");
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unclosed ${name}`);
}

const page = asset("ogh9jurw");
const settings = asset("unq8yzli");
const chat = asset("nmo0zeut");
const send = asset("oxnpxkxc");
const local = asset("local-conversation-thread");
const turns = asset("bzu8y8ld");

for (const marker of ["handoff", "hidden-context", "map"]) {
  assert.ok(page.includes(`native-chat-continuity-v57:${marker}`), `missing ${marker}`);
}
assert.ok(page.includes("/work/conversation/`+encodeURIComponent(mapped)"));
assert.ok(page.includes("getExtraDeveloperInstructions:()=>[CDRContext]"));
assert.ok(page.includes("map.byLocal[key]=e;map.byChat[e]=key"));
assert.ok(chat.includes("native-chat-continuity-v57:official-models"));
assert.ok(chat.includes("async models(){return Hn(await this.request.getModelsResponse())}"));
assert.ok(!chat.includes("function CDRMergeChatModels"));
assert.ok(!settings.includes("CDRChatFlatSelector"));
assert.ok(!settings.includes("chat-models-v56"));
assert.ok(!send.includes("CDRStickyChatSend"));
assert.ok(!local.includes("cdr-thread-extras"));
assert.ok(!turns.includes("cdr-thread-extras"));

const context = { globalThis: null, Date };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
  `${extractFunction(local, "CDRPublishCodexContext")};globalThis.publish=CDRPublishCodexContext`,
  context,
);
context.publish("local:task-1", [
  { turn: { items: [{ type: "userMessage", content: [{ type: "text", text: "first question" }] }] } },
  { turn: { items: [{ type: "agentMessage", text: "first answer" }] } },
  { turn: { items: [{ role: "user", message: { content: "follow up" } }] } },
]);
const published = context.__cdrCodexContextByThread["local:task-1"];
assert.ok(published.text.includes("User: first question"));
assert.ok(published.text.includes("Assistant: first answer"));
assert.ok(published.text.includes("User: follow up"));
assert.strictEqual(published.turnCount, 3);

console.log("v57 native Chat continuity tests passed");
