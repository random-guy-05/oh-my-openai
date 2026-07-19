#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const remote = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js",
  "utf8",
);
const home = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/work-home-page-CA5VNwMV.js",
  "utf8",
);
const page = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
  "utf8",
);

// Around Ec / Mn / conversation title helpers
const ec = remote.indexOf("function Ec(e,t){");
console.log(remote.slice(ec, ec + 900));

for (const n of ["ml(", "getConversation(", "turns", "agentMessage", "title", "cwd"]) {
  const c = (remote.slice(ec, ec + 5000).match(new RegExp(n.replace(/[()]/g, "\\$&"), "g")) || []).length;
  console.log("near Ec", n, c);
}

// Find title helper for local conversations used in sidebar
console.log("\npage ml/title", page.indexOf("function ml("));
const titleIdx = page.indexOf("title:ml(");
console.log(page.slice(titleIdx - 50, titleIdx + 150));

// Home: how composer submits - look for ge/hS submit internals via prompt
console.log("\nhome composer ge usage");
console.log(home.slice(home.indexOf("(0,N.jsx)(ge,"), home.indexOf("(0,N.jsx)(ge,") + 400));

// Can we trigger submit via simulating? Look for onSubmitAccepted in quick
const quick = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
  "utf8",
);
const osa = quick.indexOf("onSubmitAccepted");
console.log("\nonSubmitAccepted samples");
let from = 0, n = 0;
while (n < 3) {
  const i = quick.indexOf("onSubmitAccepted", from);
  if (i < 0) break;
  console.log(quick.slice(i - 40, i + 200));
  from = i + 10;
  n++;
}
