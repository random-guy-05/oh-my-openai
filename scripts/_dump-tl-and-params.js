#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js"), "utf8");

// Find tl definition - likely function tl(e){return
for (const re of [
  /function tl\([^)]*\)\{[^}]{0,200}\}/,
  /tl=e=>[^,]{0,120}/,
  /tl=function[^}]{0,200}\}/,
]) {
  const m = local.match(re);
  console.log("match", re, m && m[0]);
}

const i = local.indexOf("tl(n)");
console.log("\ntl(n) context", local.slice(i - 50, i + 80));

// Full params.cwd / params.threadId sites
for (const needle of ["params.cwd", "params.threadId", "params.input", "params.model"]) {
  let idx = 0,
    n = 0;
  console.log("\n====", needle, "====");
  while ((idx = local.indexOf(needle, idx)) >= 0 && n < 8) {
    console.log(local.slice(Math.max(0, idx - 100), idx + 120));
    console.log("---");
    idx += needle.length;
    n++;
  }
}

// Also in turns bundle
const turns = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("bzu8y8ld") && f.endsWith(".js"))),
  "utf8",
);
for (const needle of ["params.cwd", "turn.params", ".params."]) {
  let idx = 0,
    n = 0;
  console.log("\n==== turns", needle, "====");
  while ((idx = turns.indexOf(needle, idx)) >= 0 && n < 6) {
    console.log(turns.slice(Math.max(0, idx - 80), idx + 100));
    console.log("---");
    idx += needle.length;
    n++;
  }
}
