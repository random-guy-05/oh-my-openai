#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

// Broader Nl import search
const files = asar.listPackage(root).filter((f) => f.endsWith(".js") && f.includes("webview/assets"));
let found = 0;
for (const f of files) {
  const rel = f.replace(/^\//, "");
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes("oxnpxkxc")) continue;
  // any mention of importing Nl near oxnpxkxc
  const idx = s.indexOf("oxnpxkxc");
  // look at surrounding 500 chars of each oxnpxkxc mention for Nl
  let i = 0;
  while ((i = s.indexOf("oxnpxkxc", i)) >= 0) {
    const window = s.slice(Math.max(0, i - 500), i + 80);
    if (/\bNl\b/.test(window)) {
      console.log("\n====", rel);
      console.log(window);
      found++;
    }
    i += 8;
  }
}
console.log("found", found);

// In oxnpxkxc itself - find how follow-up works. Search for methods that take input array
const send = asar
  .extractFile(
    root,
    asar
      .listPackage(root)
      .find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))
      .replace(/^\//, ""),
  )
  .toString("utf8");

// Class method that might be the public send API - look for "input:" near async methods after interrupt
const names = [
  "sendUserInput",
  "submitUserMessage",
  "queueUserMessage",
  "runUserTurn",
  "startUserTurn",
  "sendConversationTurn",
  "appendUserMessage",
  "postUserMessage",
  "handleUserMessage",
  "userMessage",
];
for (const n of names) {
  if (send.includes(n)) console.log("has", n);
}

// Search string "clientUserMessageId" call sites - that's specific to turn start
let i = 0,
  n = 0;
console.log("\nclientUserMessageId sites:");
while ((i = send.indexOf("clientUserMessageId", i)) >= 0 && n < 25) {
  const ctx = send.slice(Math.max(0, i - 80), i + 100);
  if (!ctx.includes("let{") && !ctx.includes("clientUserMessageId:o") && !ctx.includes("c=s.")) {
    console.log("---", i, ctx.replace(/\n/g, " "));
  }
  i += 18;
  n++;
}
