#!/usr/bin/env node
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cdr-v41-live-"));
execFileSync("npx", ["asar", "extract", ASAR, tmp], { cwd: ROOT, stdio: "pipe" });

const assets = path.join(tmp, "webview/assets");
const page = fs
  .readdirSync(assets)
  .find((f) => f.includes("ogh9jurw") && f.endsWith(".js"));
const chat = fs
  .readdirSync(assets)
  .find((f) => f.includes("nmo0zeut") && f.endsWith(".js"));
const big = fs
  .readdirSync(assets)
  .find((f) => f.includes("oieh6gbs") && f.endsWith(".js"));

const pageSrc = fs.readFileSync(path.join(assets, page), "utf8");
const chatSrc = fs.readFileSync(path.join(assets, chat), "utf8");
const bigSrc = big ? fs.readFileSync(path.join(assets, big), "utf8") : "";

console.log("live page", page);
const mode = pageSrc.indexOf("chat-usage-v41:mode");
console.log("mode at", mode);
console.log(pageSrc.slice(mode - 250, mode + 550));
console.log("\n--- sync ---");
const sync = pageSrc.indexOf("chat-usage-v41:sync");
console.log(pageSrc.slice(sync - 100, sync + 500));

console.log("\nchat Instant", chatSrc.includes("selectedLabel:`5.5 Instant`"));
console.log("chat sliderSettings:[]", chatSrc.includes("sliderSettings:[]"));
console.log("chat merge replace", /internalOptions:\[\]/.test(chatSrc));

// How home chooses composer / origin when productMode is codex
console.log("\n=== productMode / home composer ===");
for (const pat of [
  "productMode",
  "conversationOrigin",
  "preserveHomeComposerMode",
  "startNewConversation",
  "`tpp`",
  "cdr-product-mode",
]) {
  console.log(pat, (pageSrc.split(pat).length - 1), bigSrc ? (bigSrc.split(pat).length - 1) : 0);
}

// Find home route component that picks local vs chatgpt
const homeIdx = pageSrc.indexOf("if(n===`chat`){a(`/`");
console.log("\nnew-task chat branch", homeIdx, pageSrc.slice(homeIdx, homeIdx + 250));

// Find what `/` renders - look for Route path
let i = 0,
  c = 0;
while (c < 15) {
  i = pageSrc.indexOf('path:`/`', i);
  if (i < 0) {
    i = pageSrc.indexOf('path:"/"', i);
  }
  if (i < 0) break;
  console.log("path /", i, pageSrc.slice(i, i + 200));
  i += 8;
  c++;
}

// Look for createBrowserRouter or routes with local
for (const pat of ["path:`/local", "path:`/chat", "ChatGPT", "LocalConversation", "conversationOrigin:null", "conversationOrigin:`tpp`"]) {
  const j = pageSrc.indexOf(pat);
  console.log(pat, j);
}

fs.rmSync(tmp, { recursive: true, force: true });
