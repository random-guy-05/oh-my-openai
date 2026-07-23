#!/usr/bin/env node
"use strict";
/**
 * Dump v51-related patches and extras/thread-open crash candidates from live asar.
 */
const asar = require("@electron/asar");
const os = require("os");
const root =
  os.homedir() +
  "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

function file(namePart) {
  const f = asar
    .listPackage(root)
    .find((x) => x.includes(namePart) && x.endsWith(".js"));
  if (!f) throw new Error("missing " + namePart);
  return asar.extractFile(root, f.replace(/^\//, "")).toString("utf8");
}

const local = file("local-conversation-thread-Bnxyo76e");
const send = file("oxnpxkxc");
const page = file("ogh9jurw");
const turns = file("bzu8y8ld");

console.log("=== MARKERS ===");
for (const [label, s] of [
  ["local", local],
  ["send", send],
  ["page", page],
  ["turns", turns],
]) {
  const ms = [
    ...s.matchAll(/codex-rebuild:sticky-chat-v\d+[:\w-]*/g),
  ].map((m) => m[0]);
  console.log(label, [...new Set(ms)]);
}

// Extras tick / merge in local thread
console.log("\n=== extras tick vicinity ===");
let i = local.indexOf("cdr-thread-extras");
let n = 0;
while (i >= 0 && n < 6) {
  console.log("\n---", i);
  console.log(local.slice(Math.max(0, i - 200), i + 450));
  i = local.indexOf("cdr-thread-extras", i + 1);
  n++;
}

// gS / visibleTurnEntries
console.log("\n=== gS / visibleTurn ===");
for (const needle of ["visibleTurnEntries", "extras-safe", "gs-guard", "function gS", "function CC"]) {
  const j = local.indexOf(needle);
  console.log(needle, j);
  if (j >= 0) console.log(local.slice(j, j + 250));
}

// Oops in page
console.log("\n=== Oops in ogh9jurw ===");
i = page.indexOf("Oops");
n = 0;
while (i >= 0 && n < 5) {
  console.log(page.slice(Math.max(0, i - 120), i + 300));
  i = page.indexOf("Oops", i + 1);
  n++;
}

// turn-safe in page - did optional chaining break something that expects turnId always?
console.log("\n=== turn-safe ===");
i = page.indexOf("turn-safe");
console.log(page.slice(Math.max(0, i - 100), i + 200));
// surrounding use of u=
console.log("\n=== u= turnId usage after steer ===");
i = page.indexOf("sticky-chat-v51:turn-safe");
if (i < 0) i = page.indexOf("u=(await Ml(e,t,{input:f");
console.log(page.slice(Math.max(0, i - 400), i + 500));
