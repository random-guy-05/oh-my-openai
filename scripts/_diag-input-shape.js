#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

// Find composer submit that builds input array for turn
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  if (fs.statSync(p).size > 4e6) continue;
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes("input:") || !s.includes("collaborationMode")) continue;
  if (!s.includes("sendUserMessage") && !s.includes("oD(") && !s.includes("turn/start")) continue;
  // look for functions that create input from composer text
  if (s.includes("type:`text`") && s.includes("text:") && s.includes("input")) {
    const i = s.indexOf("type:`text`");
    if (i > 0) {
      console.log("FILE", f);
      console.log(s.slice(i - 100, i + 200));
      console.log("---");
    }
  }
}

// In send file, how s.input is used later in oD
const send = fs.readFileSync(
  path.join(assets, "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js"),
  "utf8",
);
const od = send.indexOf("async function oD(e,t,n){");
const des = send.indexOf("let{beforeSendRequest", od);
// find where input is transformed
const chunk = send.slice(des, des + 8000);
for (const n of ["s.input", "input:", "normalizeInput", "toTurnInput", "userInput"]) {
  let p = 0,
    c = 0;
  while ((p = chunk.indexOf(n, p)) >= 0 && c < 4) {
    console.log(n, chunk.slice(Math.max(0, p - 40), p + 120).replace(/\n/g, " "));
    p += n.length;
    c++;
  }
}
