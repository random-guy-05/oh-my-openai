#!/usr/bin/env node
"use strict";
const fs = require("fs");
const files = {
  page: "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  settings:
    "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  chat: "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
};
for (const [k, p] of Object.entries(files)) {
  const s = fs.readFileSync(p, "utf8");
  const markers = [...new Set([...s.matchAll(/codex-rebuild:[a-z0-9:-]+/g)].map((m) => m[0]))]
    .filter((m) => /chat-usage|chat-models|local-canonical-selector|force|CDRMerge|5\.5 Instant/.test(m) || m.includes("chat"))
    .sort();
  console.log("\n", k);
  console.log(" markers", markers.join(", ") || "(none matching filter)");
  console.log(" force-codex", s.includes("if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`"));
  console.log(" chat navigate", s.includes("a(`/`,{state:{chatGptProjectId:null"));
  console.log(" Instant", s.includes("selectedLabel:`5.5 Instant`"));
  console.log(" CDRMerge", s.includes("function CDRMergeChatModels("));
  console.log(" internalOptions:[]", s.includes("internalOptions:[]"));
}
