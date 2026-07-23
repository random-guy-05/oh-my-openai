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

const xn = chat.indexOf("function Xn(");
console.log("==== Xn ====");
console.log(chat.slice(xn, xn + 900));

const nr = chat.indexOf("function nr(");
console.log("\n==== nr ====");
console.log(chat.slice(nr, nr + 400));

const tr = chat.indexOf("function tr(");
console.log("\n==== tr ====");
console.log(chat.slice(tr, tr + 500));

// Ug Cg full
for (const name of ["function Ug(", "function Cg("]) {
  const i = settings.indexOf(name);
  console.log("\n====", name, "====");
  // extract until next function at same level roughly 1500 chars
  console.log(settings.slice(i, i + 1500));
}

// How te is consumed - look for te.map or power rows
let i = settings.indexOf("te.map");
console.log("\n==== te.map ====", i);
console.log(settings.slice(i, i + 600));
i = settings.indexOf(".modelLabel");
console.log("\n==== .modelLabel render ====");
let c = 0,
  idx = 0;
while ((idx = settings.indexOf(".modelLabel", idx)) >= 0 && c < 8) {
  console.log(settings.slice(Math.max(0, idx - 80), idx + 150));
  console.log("---");
  idx += 11;
  c++;
}
