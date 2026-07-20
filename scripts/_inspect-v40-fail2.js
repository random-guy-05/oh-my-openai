#!/usr/bin/env node
"use strict";
const fs = require("fs");
const s = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "utf8",
);

// Find end of installLocalModeRuntime IIFE in mk
const start = s.indexOf(
  "function mk({conversationId:e,hideLabel:t,permissionsCwdOverride:i,permissionsHostId:a}){/* codex-rebuild:local-canonical-model-picker-v5 */",
);
console.log("mk start", start);

// Search for return globalThis.__cdrLocalModeV4 near mk
let i = s.indexOf("return globalThis.__cdrLocalModeV4;", start);
console.log("return at", i);
console.log(JSON.stringify(s.slice(i, i + 350)));

// Also find after IIFE close
const close = s.indexOf("})();", i);
console.log("\nclose candidates:");
for (let c = 0, j = i; c < 5; c++) {
  j = s.indexOf("})();", j);
  if (j < 0) break;
  console.log(j, JSON.stringify(s.slice(j, j + 200)));
  j += 5;
}

// stripV38 anchors
for (const pat of [
  "{data:_,status:v}=Ga({hostId:f.hostId}),y=(()=>{/* codex-rebuild:chat-models-v38:y */",
  "return _?.models})(),{modelSettings:S",
  "te=CDRRuntime.mode()===`chat`?Ug(y):Cg(y,l),ne=Ug(y)/* codex-rebuild:chat-models-v38:te */",
  "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);(0,_k.useEffect)(()=>{/* codex-rebuild:chat-models-v38:load */",
  "},[CDRRuntime,o,V_]);let de=",
  "[u,d]=(0,_k.useState)(null),[CDRChatY,CDRSetChatY]=(0,_k.useState)(null),f=Rl(e)",
]) {
  console.log("\n", pat.slice(0, 60), "...", s.includes(pat));
}

// page anchors
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);
const pagePat =
  "(0,BI.useLayoutEffect)(()=>{if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s]);u=e=>{let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext)};";
console.log("\npage anchor", page.includes(pagePat));
if (!page.includes(pagePat)) {
  const j = page.indexOf("useLayoutEffect)(()=>{if(r!==`codex`)");
  console.log("partial", j, JSON.stringify(page.slice(j, j + 350)));
}
