#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const i = local.indexOf("visibleTurnEntries:_.get(al,");
console.log(local.slice(i, i + 400));

const j = local.indexOf("conversationTurns}:null");
console.log("\nall conversationTurns usages:");
let idx = 0,
  n = 0;
while ((idx = local.indexOf(".conversationTurns", idx)) >= 0 && n < 20) {
  console.log(n, local.slice(idx - 70, idx + 40).replace(/\n/g, " "));
  idx += 18;
  n++;
}

// Page v42 full block exact
const page = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  ),
  "utf8",
);
const a = page.indexOf("let CDROnLocal=");
const b = page.indexOf("};", page.indexOf("chat-usage-v42:mode")) + 2;
console.log("\nPAGE BLOCK LEN", b - a);
console.log(page.slice(a, b));

// oD input field
const send = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  ),
  "utf8",
);
const od = send.indexOf("async function oD(e,t,n){");
// find s.input or input usage after destructure
const des = send.indexOf("let{beforeSendRequest", od);
console.log("\ninput mentions in oD first 3k after des:");
const chunk = send.slice(des, des + 3500);
for (const n of ["s.input", ".input", "userMessage", "text:", "items:"]) {
  let p = 0,
    c = 0;
  while ((p = chunk.indexOf(n, p)) >= 0 && c < 3) {
    console.log(n, p, chunk.slice(p, p + 100));
    p += n.length;
    c++;
  }
}
