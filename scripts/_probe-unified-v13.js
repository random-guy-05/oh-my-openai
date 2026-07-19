#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets =
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets";
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const remote = fs.readFileSync(
  path.join(assets, "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js"),
  "utf8",
);
const home = fs.readFileSync(path.join(assets, "work-home-page-CA5VNwMV.js"), "utf8");
const quick = fs.readFileSync(
  path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"),
  "utf8",
);

function dump(src, needle, n = 800) {
  const i = src.indexOf(needle);
  console.log("\n====", needle.slice(0, 60), i);
  if (i >= 0) console.log(src.slice(i, i + n));
}

dump(page, "onModeSelect:e=>{");
dump(page, "CDRChatModeFromRoute");
dump(page, "z=({target:t})=>{if(t.source===`chatgpt`)");
dump(remote, "codex-rebuild:chat-codex-handoff");
dump(home, "cdrContinueThreadKey");
dump(home, "function j(e){");
dump(quick, "codex-rebuild:chat-origin");

// helpers for local id from path
dump(page, "`/local/");
dump(page, "`/work/conversation/");

// getCompleteConversationTurns accessibility near Aw imports
console.log("\ngetCompleteConversationTurns remote", remote.indexOf("getCompleteConversationTurns"));
console.log("mt( parse thread", remote.indexOf("function Ec("));
