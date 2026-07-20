#!/usr/bin/env node
"use strict";
const fs = require("fs");
const s = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "utf8",
);

for (const pat of [
  "chat-models-v38",
  "chat-usage-v40",
  "chat-usage-v41",
  "CDRChatY",
  "te=Cg(y,l),ne=Ug(y)",
  "te=CDRRuntime",
  "te=(CDRMode",
  "picker-clean",
]) {
  const i = s.indexOf(pat);
  console.log(pat, i);
  if (i >= 0) console.log(" ", JSON.stringify(s.slice(i, i + 180)));
}

// Find all te= near model picker
let i = s.indexOf("local-canonical-model-picker-v5");
const chunk = s.slice(i, i + 12000);
const teIdx = chunk.indexOf("te=");
console.log("\nte in mk chunk", teIdx, JSON.stringify(chunk.slice(teIdx, teIdx + 200)));

// Simulate strip and see result
function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: ${n}`);
  return src.replace(from, to);
}
let out = s;
if (out.includes("[CDRChatY,CDRSetChatY]")) {
  out = replaceOnce(
    out,
    "[u,d]=(0,_k.useState)(null),[CDRChatY,CDRSetChatY]=(0,_k.useState)(null),f=Rl(e)",
    "[u,d]=(0,_k.useState)(null),f=Rl(e)",
    "CDRChatY",
  );
}
const yStart = out.indexOf(
  "{data:_,status:v}=Ga({hostId:f.hostId}),y=(()=>{/* codex-rebuild:chat-models-v38:y */",
);
console.log("yStart", yStart);
if (yStart >= 0) {
  const yEnd = out.indexOf("return _?.models})(),{modelSettings:S", yStart);
  out =
    out.slice(0, yStart) +
    "{data:_,status:v}=Ga({hostId:f.hostId}),y=_?.models,{modelSettings:S" +
    out.slice(yEnd + "return _?.models})(),{modelSettings:S".length);
}
if (out.includes("chat-models-v38:te")) {
  console.log("has v38 te");
  out = replaceOnce(
    out,
    "te=CDRRuntime.mode()===`chat`?Ug(y):Cg(y,l),ne=Ug(y)/* codex-rebuild:chat-models-v38:te */",
    "te=Cg(y,l),ne=Ug(y)",
    "te",
  );
}
console.log("after strip te=Cg?", out.includes("te=Cg(y,l),ne=Ug(y)"));
console.log("v38 left?", out.includes("chat-models-v38"));
const t = out.indexOf(",te=");
console.log("te sample", JSON.stringify(out.slice(t, t + 120)));
