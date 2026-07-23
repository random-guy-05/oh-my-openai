#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const fs = require("fs");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

// Dump export map from oxnpxkxc tail
const sendRel = asar
  .listPackage(root)
  .find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))
  .replace(/^\//, "");
const send = asar.extractFile(root, sendRel).toString("utf8");
const exportIdx = send.lastIndexOf("export{");
console.log("export block:\n", send.slice(exportIdx, exportIdx + 2500));

// Find follow-up send: search for conversationId + input patterns near Bo usage
const kgjRel = asar
  .listPackage(root)
  .find((f) => f.includes("kgjrczv7") && f.endsWith(".js"))
  .replace(/^\//, "");
const kgj = asar.extractFile(root, kgjRel).toString("utf8");

// Find who uses Bo - search for imports of Bo from kgj in other files
console.log("\n\nkgj exports:");
const kgjExp = kgj.lastIndexOf("export{");
console.log(kgj.slice(kgjExp, kgjExp + 1500));

// Search local-conversation for submit
for (const name of [
  "local-conversation-thread",
  "local-conversation-page",
  "Bnxyo76e",
  "composer",
]) {
  const hits = asar
    .listPackage(root)
    .filter((f) => f.includes(name) && f.endsWith(".js"));
  console.log("\nfiles", name, hits);
}

// In local conversation thread - find submit / startConversation / Nl
const localRel = asar
  .listPackage(root)
  .find((f) => f.includes("local-conversation-thread") && f.endsWith(".js"))
  .replace(/^\//, "");
const local = asar.extractFile(root, localRel).toString("utf8");
console.log("\nlocal size", local.length);
for (const p of [
  "startConversation",
  "Bo(",
  "submit",
  ".turn",
  "Nl(",
  "onSubmit",
  "sendMessage",
  "followUp",
]) {
  console.log(p, local.includes(p), (local.split(p).length - 1));
}

// Dump createConversation return shape - does it have .turn?
const cc = send.indexOf("createConversation({");
console.log("\ncreateConversation usage contexts...");
let i = send.indexOf("async createConversation");
if (i < 0) i = send.indexOf("createConversation(");
console.log("idx", i);
// find class method createConversation
const m = send.indexOf("createConversation({clientUserMessageId");
console.log("call site in startConversation area already known");

// Search for `.turn` after createConversation response
const cr = send.indexOf("conversationResponse");
console.log("conversationResponse sample", send.slice(cr, cr + 200));
