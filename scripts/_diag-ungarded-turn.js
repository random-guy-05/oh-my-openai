#!/usr/bin/env node
"use strict";
const fs = require("fs");
const local = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  "utf8",
);
const bzu = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  "utf8",
);

// Find unguarded .turn. accesses in local around render/CC
const re = /[^?]\.turn\.[a-zA-Z]/g;
let m,
  n = 0;
while ((m = re.exec(local)) && n < 25) {
  const i = m.index;
  const ctx = local.slice(Math.max(0, i - 50), i + 60).replace(/\n/g, " ");
  if (!ctx.includes("?.turn") && !ctx.includes("`turn`in")) {
    console.log(i, ctx);
    n++;
  }
}

console.log("\n--- bzu unguarded .turn. near Fa/Na ---");
const fa = bzu.indexOf("function Fa(");
const chunk = bzu.slice(fa, fa + 8000);
n = 0;
const re2 = /[^?]\.turn\.[a-zA-Z]/g;
while ((m = re2.exec(chunk)) && n < 20) {
  console.log(fa + m.index, chunk.slice(Math.max(0, m.index - 40), m.index + 50).replace(/\n/g, " "));
  n++;
}

// How Wa/Ia build entries from turns
const Ia = bzu.indexOf("function Ia(");
console.log("\nIa", bzu.slice(Ia, Ia + 200));
const Ge = bzu.indexOf("function Ge(");
console.log("Ge", bzu.slice(Ge, Ge + 200));
