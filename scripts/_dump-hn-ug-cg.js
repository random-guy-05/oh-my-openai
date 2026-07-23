#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const chat = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("nmo0zeut") && f.endsWith(".js"))),
  "utf8",
);
const settings = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js"))),
  "utf8",
);

const hn = chat.indexOf("function Hn(");
console.log("==== Hn full ====");
console.log(chat.slice(hn, hn + 1200));

// Jn Yn nr - option builders
for (const n of ["function Jn(", "function Yn(", "function nr(", "function tr(", "function $n("]) {
  const i = chat.indexOf(n);
  console.log("\n====", n, "====");
  console.log(chat.slice(i, i + 500));
}

// CDRMergeChatModels full
const m = chat.indexOf("function CDRMergeChatModels");
console.log("\n==== CDRMergeChatModels ====");
console.log(chat.slice(m, m + 900));

// Ug and Cg
for (const n of ["function Ug(", "function Cg(", "function Ab("]) {
  const i = settings.indexOf(n);
  console.log("\n====", n, i, "====");
  console.log(settings.slice(i, i + 700));
}

// How te rows are rendered - modelLabel
const ml = settings.indexOf("modelLabel");
console.log("\n==== modelLabel usage ====");
let i = 0,
  c = 0;
while ((i = settings.indexOf("modelLabel", i)) >= 0 && c < 6) {
  console.log(settings.slice(Math.max(0, i - 60), i + 120));
  console.log("---");
  i += 10;
  c++;
}

// picker-layout marker
const k = settings.indexOf("sticky-chat-v45:picker-layout");
console.log("\n==== picker-layout ====");
console.log(settings.slice(k - 200, k + 200));
