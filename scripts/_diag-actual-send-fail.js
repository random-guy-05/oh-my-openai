#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const send = fs.readFileSync(
  path.join(assets, "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js"),
  "utf8",
);
const chat = fs.readFileSync(
  path.join(assets, "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js"),
  "utf8",
);
const settings = fs.readFileSync(
  path.join(assets, "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js"),
  "utf8",
);

console.log("=== SEND BRIDGE STATE ===");
for (const m of [
  "sticky-chat-v44",
  "sticky-chat-v43:bridge",
  "falling back to AppServer",
  "client not ready yet",
  "CDRStickyChatSend",
]) {
  console.log(m, send.includes(m), send.indexOf(m));
}

const b = send.indexOf("async function CDRStickyChatSend");
console.log(send.slice(b, b + 800));

console.log("\n=== CHAT CLIENT PUBLISH ===");
for (const m of [
  "sticky-chat-v44:publish-models",
  "sticky-chat-v43:publish-client",
  "__cdrChatClient",
]) {
  console.log(m, chat.includes(m), chat.indexOf(m));
}

// How is Conversation client constructed / stored in jotai?
console.log("\n=== CLIENT CONSTRUCTION ===");
const ctor = chat.indexOf("startCompletionStream");
console.log(chat.slice(ctor - 400, ctor + 100));

// Find class that has startCompletionStream - look for constructor nearby
const cls = chat.lastIndexOf("class ", ctor);
console.log("class before", cls, chat.slice(cls, cls + 200));

// Find where client is put in jotai / atom
const bzu = fs
  .readdirSync(assets)
  .find((f) => f.includes("bzu8y8ld") && f.endsWith(".js"));
const bz = fs.readFileSync(path.join(assets, bzu), "utf8");
const sc = bz.indexOf("startCompletionStream");
console.log("\n=== bzu caller ===");
console.log(bz.slice(sc - 200, sc + 300));

// Find atom holding client - wt from earlier summary
for (const n of ["get(wt)", "atom(null)", "ConversationClient", "chatgptClient", "setChatClient"]) {
  console.log(n, bz.indexOf(n));
}

console.log("\n=== PICKER STATE ===");
for (const m of [
  "CDRChatPowerSelections",
  "sticky-chat-v43:picker",
  "chat-models-v39",
  "te=CDRMode===`chat`",
  "te=Cg(y,l)",
  "K=g&&te.length>=4",
  "advanced",
  "simple",
]) {
  console.log(m, settings.includes(m) ? settings.indexOf(m) : -1);
}

// How advanced vs simple picker is chosen
const k = settings.indexOf("K=g&&te.length>=4");
console.log("\npicker mode logic", settings.slice(k, k + 350));
