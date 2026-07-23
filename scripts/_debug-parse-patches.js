#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const acorn = require("acorn");
const os = require("os");
const fs = require("fs");
const root =
  os.homedir() +
  "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

function load(part) {
  const f = asar
    .listPackage(root)
    .find((x) => x.includes(part) && x.endsWith(".js"));
  return {
    name: f,
    src: asar.extractFile(root, f.replace(/^\//, "")).toString("utf8"),
  };
}

function extractFn(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  if (start < 0) return null;
  let depth = 0,
    started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      started = true;
    } else if (src[i] === "}") {
      depth--;
      if (started && depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function checkParse(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
    console.log(label, "PARSE OK", src.length);
  } catch (e) {
    console.log(label, "PARSE FAIL", e.message);
  }
}

for (const part of [
  "local-conversation-thread-Bnxyo76e",
  "oxnpxkxc",
  "ogh9jurw",
  "bzu8y8ld",
]) {
  const { name, src } = load(part);
  checkParse(part, src);
  // find mangled markers
  const mangled = [...src.matchAll(/codex-rebuild:(codex-rebuild:)+/g)];
  console.log(part, "mangled markers", mangled.length, mangled[0] && mangled[0][0]);
}

const local = load("local-conversation-thread-Bnxyo76e").src;
for (const needle of [
  "function gS(e,t){",
  "function CC({",
  "function NC",
]) {
  const fn = extractFn(local, needle);
  console.log("\n====", needle, "len", fn && fn.length);
  if (fn) console.log(fn.slice(0, 800));
}

const turns = load("bzu8y8ld").src;
console.log("\n==== turns-fa-safe vicinity ====");
const i = turns.indexOf("turns-fa-safe");
console.log(turns.slice(Math.max(0, i - 300), i + 500));

// sticky mode in ogh9jurw
const page = load("ogh9jurw").src;
console.log("\n==== sticky mode ====");
const j = page.indexOf("sticky-chat-v43:mode");
console.log(page.slice(Math.max(0, j - 200), j + 600));
