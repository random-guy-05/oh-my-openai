#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const bzu = [...fs.readdirSync(assets)].find(
  (f) => f.includes("bzu8y8ld") && f.endsWith(".js"),
);
const bz = fs.readFileSync(path.join(assets, bzu), "utf8");

// Find wt definition / export
const exp = bz.slice(bz.lastIndexOf("export{"));
const wtMap = exp.match(/([A-Za-z0-9_$]+) as wt[,}]/);
console.log("wt export", wtMap);

// Search wt=
for (const p of ["wt=", "wt =", ",wt=", "const wt", "let wt", "var wt"]) {
  const i = bz.indexOf(p);
  if (i >= 0) console.log(p, i, bz.slice(i, i + 200));
}

// Find set(wt or store.set with client
let idx = 0,
  n = 0;
while ((idx = bz.indexOf("wt", idx)) >= 0 && n < 30) {
  const ctx = bz.slice(idx - 30, idx + 50);
  if (/set\([^\)]*wt|wt[^\n]{0,40}Client|Provider|createStore/.test(ctx)) {
    console.log("ctx", idx, ctx);
    n++;
  }
  idx += 2;
}

// Search across assets for where chatgpt client atom is written
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  if (fs.statSync(p).size > 3e6) continue;
  const s = fs.readFileSync(p, "utf8");
  if (s.includes("startCompletionStream") && s.includes("atom") && s.includes("set(")) {
    if (f.includes("bzu8y8ld") || f.includes("nmo0zeut")) continue;
    const i = s.indexOf("startCompletionStream");
    console.log("\nFILE", f);
    console.log(s.slice(Math.max(0, i - 150), i + 100));
  }
}

// Find Provider value with client class instance
const chat = fs.readFileSync(
  path.join(
    assets,
    "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  ),
  "utf8",
);
const ctor = chat.indexOf("class extends Ae{constructor(){super({getAdditionalHeaders:Ai})}");
console.log("\nctor", ctor);
console.log(chat.slice(ctor, ctor + 300));

// Who does `new` that class?
const expChat = chat.slice(chat.lastIndexOf("export{"));
console.log("exports with Cn/client-ish", expChat.slice(0, 400));
