#!/usr/bin/env node
"use strict";
const fs = require("fs");
const BIG =
  "src/mac-x64/_asar/webview/assets/app-initial~avatarOverlayCompositionSurface~app-main~pet-install-modal-host~quick-chat-wind~oieh6gbs-Cqdhv7ms.js";
const PAGE =
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js";
const CHAT =
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js";
const big = fs.readFileSync(BIG, "utf8");
const page = fs.readFileSync(PAGE, "utf8");
const chat = fs.readFileSync(CHAT, "utf8");

// How origin is computed for primary composer
const idx = big.indexOf("conversationOrigin:m");
console.log(big.slice(idx - 800, idx + 400));

console.log("\n--- ue/origin helpers ---");
for (const pat of ["conversationOrigin===", "conversationOrigin=", "ue=t.conversationOrigin", "yl,", "`tpp`"]) {
  let i = 0,
    c = 0;
  while (c < 4) {
    i = big.indexOf(pat, i);
    if (i < 0) break;
    console.log(pat, i, big.slice(Math.max(0, i - 40), i + 160).replace(/\n/g, " "));
    i += pat.length;
    c++;
  }
}

// models() and placeholder in chat module for catalog patch anchors
console.log("\n--- catalog anchors ---");
for (const pat of [
  "async models(){return",
  "this.safeGet(`/models`",
  "enabled:!1,queryFn:()=>e.get(L).internalModels()",
  "enabled:!0,queryFn:()=>e.get(L).internalModels()",
  "placeholderData:or",
  "QL=`auto`",
  "defaultModelSlug",
]) {
  console.log(pat, chat.indexOf(pat));
  if (chat.indexOf(pat) >= 0) console.log(chat.slice(chat.indexOf(pat), chat.indexOf(pat) + 200));
}

// new task chat branch already present?
console.log("\n--- new task chat ---");
console.log(page.includes("if(n===`chat`){a(`/`"));
console.log(page.slice(page.indexOf("if(n===`chat`){a(`/`"), page.indexOf("if(n===`chat`){a(`/`") + 200));
