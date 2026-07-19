#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) for (const item of child) if (item?.type) walk(item, visitor);
    else if (child?.type) walk(child, visitor);
  }
}

function contexts(src, needle, limit = 6, radius = 180) {
  let i = 0, n = 0;
  while ((i = src.indexOf(needle, i)) !== -1 && n < limit) {
    console.log(`\n[${needle}#${n}@${i}]`, src.slice(Math.max(0, i - radius), i + radius).replace(/\n/g, " "));
    i += needle.length;
    n++;
  }
}

const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const catalog = fs.readFileSync(
  path.join(assets, fs.readdirSync(assets).find((n) => n.includes("quick-ch") && n.includes("projects-index") && n.endsWith(".js"))),
  "utf8",
);

// How local/codex conversations are routed
console.log("==== local conversation routes ====");
for (const needle of [
  "/local/",
  "local-conversation",
  "turn/start",
  "startCompletionStream",
  "composerMode",
  "conversation_origin",
  "tppExecutionTarget",
  "source:`codex`",
  "kind:`local`",
]) {
  const files = [];
  for (const name of fs.readdirSync(assets).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(assets, name), "utf8");
    if (src.includes(needle)) files.push(name);
  }
  if (files.length) console.log(needle, "->", files.slice(0, 6).join(" | "), files.length > 6 ? `(+${files.length - 6})` : "");
}

console.log("\n==== startCompletionStream vs turn/start ====");
contexts(catalog, "startCompletionStream", 5, 200);
contexts(catalog, "turn/start", 5, 150);

// Find local conversation page
const localFiles = fs.readdirSync(assets).filter((f) => f.includes("local-conversation") && f.endsWith(".js"));
console.log("\nlocal files", localFiles);

for (const file of localFiles.slice(0, 3)) {
  const src = fs.readFileSync(path.join(assets, file), "utf8");
  console.log("\nFILE", file, "len", src.length);
  for (const needle of ["startCompletionStream", "turn/start", "conversationOrigin", "chatMode", "composer", "AppServer"]) {
    if (src.includes(needle)) console.log(" has", needle);
  }
}
