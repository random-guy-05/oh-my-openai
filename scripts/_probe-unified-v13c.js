#!/usr/bin/env node
"use strict";
const fs = require("fs");
const remote = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js",
  "utf8",
);
const settings = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~pull-request-route~onboarding-page~settings-page~~iaab4bzx-BHK3miry.js",
  "utf8",
);

for (const needle of [
  "getCompleteConversationTurns",
  "getConversation(",
  ".turns",
  "agentMessage",
  "userMessage",
  "function mt(",
  "kind:`local`,threadId",
]) {
  console.log(needle, "remote", remote.indexOf(needle), "settings", settings.indexOf(needle));
}

// Find mt definition - imported into remote as Tc from settings earlier was wrong
// remote: mt used in Ec - find import
const m = remote.match(/([A-Za-z0-9_$]+) as mt[,}]/);
console.log("mt import", m?.[0]);
if (m) {
  const name = m[1];
  // find in settings export
  const exp = settings.lastIndexOf("export{");
  const chunk = settings.slice(exp, exp + 5000);
  const who = chunk.match(new RegExp(`([A-Za-z0-9_$]+) as ${name}[,}]`));
  console.log("settings exports mt as", name, "from", who);
}

// Find thread key parser
for (const p of ["function mt(", "mt=e=>", "mt=t=>{", "startsWith(`local:`)"]) {
  const i = settings.indexOf(p);
  if (i >= 0) console.log("\nsettings", p, settings.slice(i, i + 400));
}

// Mn atom - history cache
const mnUse = remote.indexOf("e.get(Mn,");
console.log("\nMn uses", remote.split("e.get(Mn,").length - 1);
console.log(remote.slice(mnUse - 100, mnUse + 200));
