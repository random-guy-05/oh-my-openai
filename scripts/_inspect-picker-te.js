#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(assets, "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js"),
  "utf8",
);

function findAll(src, needle) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf(needle, i)) >= 0) {
    out.push(i);
    i += needle.length;
  }
  return out;
}

for (const needle of [
  "te=Cg(y,l)",
  "te=Ug(y)",
  "picker-clean",
  "function Cg(",
  "function Ug(",
  "function Ve(",
  "local-canonical-model-picker-v5",
]) {
  const idxs = findAll(settings, needle);
  console.log(needle, idxs.slice(0, 5));
  if (idxs[0] != null) console.log(settings.slice(idxs[0], idxs[0] + 280), "\n");
}

// Find how mk uses te/ne
const mk = settings.indexOf("function mk(");
const mkEnd = settings.indexOf("\nfunction ", mk + 20);
const mkBody = settings.slice(mk, Math.min(mk + 8000, mkEnd > 0 ? mkEnd : mk + 8000));
for (const n of ["te=", "ne=", "Cg(", "Ug(", "CDRMode", "y="]) {
  const i = mkBody.indexOf(n);
  console.log("in mk:", n, i, i >= 0 ? mkBody.slice(i, i + 120) : "");
}

// conversationTurns exact
const local = fs.readFileSync(path.join(assets, "local-conversation-thread-Bnxyo76e.js"), "utf8");
for (const n of [
  ".conversationTurns}",
  ".conversationTurns||",
  "conversationTurns:",
  "{turns:",
]) {
  const idxs = findAll(local, n);
  console.log("local", n, idxs.slice(0, 8));
  for (const i of idxs.slice(0, 3)) console.log(" ", local.slice(i - 60, i + 120));
}

// How oD is called / what n contains
const send = fs.readFileSync(
  path.join(assets, "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js"),
  "utf8",
);
const od = send.indexOf("async function oD(e,t,n){");
// find after usage guard where destructure happens
const des = send.indexOf("let{beforeSendRequest:r,inheritThreadSettings", od);
console.log("\noD destructure", send.slice(des, des + 900));
// find turn/start
const turn = send.indexOf("turn/start", od);
console.log("\nturn/start", turn, turn > 0 ? send.slice(turn - 80, turn + 200) : "");
