#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~appgen-settings-page~pull-request-route~onboarding-page~settings-page~~iaab4bzx-BHK3miry.js",
  ),
  "utf8",
);
const quick = fs.readFileSync(path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const local = fs.readFileSync(path.join(assets, "local-conversation-thread-CU8tsPvp.js"), "utf8");

function dump(src, needle, before = 80, after = 600) {
  const i = src.indexOf(needle);
  console.log("\n====", needle, "@", i);
  if (i < 0) return false;
  console.log(src.slice(Math.max(0, i - before), i + after));
  return true;
}

// How new ChatGPT / work conversations are created from home submit
dump(quick, "conversationOrigin:null", 80, 400);
dump(quick, "conversationOrigin:r", 80, 400);
dump(page, "conversationOrigin:CDRChatMode?null:`tpp`", 80, 300);

// Find home submit that calls Dm or similar with origin
dump(quick, "tppExecutionTarget:", 60, 300);

// Look for bridge local->chatgpt in codebase strings
for (const [label, src] of [
  ["page", page],
  ["quick", quick],
  ["local", local],
  ["settings", settings],
]) {
  for (const needle of [
    "continueInChatgpt",
    "continue-in-chatgpt",
    "openInChatgpt",
    "toChatgpt",
    "chatgptFromLocal",
    "handoffToChat",
    "exportTranscript",
    "copyTranscript",
    "getCompleteConversationTurns",
  ]) {
    const c = (src.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (c) console.log(label, needle, c);
  }
}

dump(settings, "getCompleteConversationTurns", 80, 500);
dump(page, "getCompleteConversationTurns", 80, 500);

// Critical: when mode=chat on a /work/conversation that has tpp origin,
// does follow-up still use tpp? Find where follow-up sets origin from URL mode
dump(quick, "mode`)===`chat`", 80, 400);
dump(quick, "get(`mode`)", 80, 400);
dump(page, "get(`mode`)", 80, 400);

// Where follow-up reads conversationOrigin for work conversation page
const chatgptPage = fs.readFileSync(path.join(assets, "chatgpt-conversation-page-CQpHKaKm.js"), "utf8");
console.log("\nchatgpt page size", chatgptPage.length);
for (const needle of ["conversationOrigin", "tpp", "mode", "Dm(", "startCompletion"]) {
  console.log("chatgptPage", needle, (chatgptPage.match(new RegExp(needle, "g")) || []).length);
}
dump(chatgptPage, "conversationOrigin", 80, 400);
