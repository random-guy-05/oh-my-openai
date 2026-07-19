#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const localThread = fs.readFileSync(path.join(assets, "local-conversation-thread-CU8tsPvp.js"), "utf8");
const catalog = fs.readFileSync(
  path.join(assets, fs.readdirSync(assets).find((n) => n.includes("quick-ch") && n.includes("projects-index") && n.endsWith(".js"))),
  "utf8",
);

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

function fn(source, name) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  let out = null;
  walk(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === name) {
      out = source.slice(node.start, node.end);
    }
  });
  return out;
}

function contexts(src, needle, limit = 6, radius = 200) {
  let i = 0, n = 0;
  while ((i = src.indexOf(needle, i)) !== -1 && n < limit) {
    console.log(`\n[${needle}#${n}]`, src.slice(Math.max(0, i - radius), i + radius).replace(/\n/g, " "));
    i += needle.length;
    n++;
  }
}

console.log("==== Aw open codex thread ====");
const aw = fn(page, "Aw") || (() => {
  // maybe const Aw=
  let i = page.indexOf("function Aw(");
  if (i < 0) i = page.indexOf("Aw=function");
  if (i < 0) {
    // search Aw= 
    i = 0;
    while ((i = page.indexOf("Aw=", i)) !== -1) {
      const prev = page[i - 1];
      if (!prev || /[^A-Za-z0-9_$]/.test(prev)) return page.slice(i, i + 800);
      i += 3;
    }
  }
  return page.slice(i, i + 800);
})();
console.log(aw?.slice?.(0, 900) || aw);

console.log("\n==== handoff / continue chatgpt ====");
for (const needle of [
  "handoff",
  "Handoff",
  "continueWith",
  "continue in",
  "toChatgpt",
  "to ChatGPT",
  "chatgptConversations",
  "openInChat",
  "composerMode:`",
  "setComposerMode",
]) {
  const inPage = page.split(needle).length - 1;
  const inLocal = localThread.split(needle).length - 1;
  const inCat = catalog.split(needle).length - 1;
  if (inPage + inLocal + inCat) console.log(needle, { page: inPage, local: inLocal, cat: inCat });
}

contexts(localThread, "handoff", 8, 180);
contexts(localThread, "composerMode", 8, 160);
contexts(localThread, "onLocalSubmitStart", 5, 200);

// Find composerMode values
contexts(page, "composerMode:", 10, 80);
contexts(localThread, "`local`", 5, 80);
contexts(localThread, "`cloud`", 5, 80);
contexts(localThread, "`remote`", 5, 80);
