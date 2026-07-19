#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");

function dump(src, i, before, after) {
  console.log(src.slice(Math.max(0, i - before), i + after));
}

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

// Find OL / project row click for codex projects
for (const name of ["OL", "Fke", "Uke", "eAe", "IAe"]) {
  const ast = parse(page, { ecmaVersion: "latest", sourceType: "module" });
  let node = null;
  walk(ast, (n) => {
    if (n.type === "FunctionDeclaration" && n.id?.name === name) node = n;
  });
  if (!node) {
    console.log(name, "missing");
    continue;
  }
  const body = page.slice(node.start, node.end);
  console.log("\n#####", name, "len", body.length);
  for (const needle of ["kind:`project`", "source===`codex`", "source===`chatgpt`", "Aw(", "route", "onSelect", "navigate", "project"]) {
    const i = body.indexOf(needle);
    if (i >= 0) console.log(" ", needle, "@", i, ":", body.slice(Math.max(0, i - 40), i + 120).replace(/\n/g, " "));
  }
}

// Find chatgpt conversation route pattern from chatTargets construction
dump(page, page.indexOf("chatTargets"), 0, 0);
const ct = page.indexOf("chatTargets:");
console.log("\nchatTargets construction");
// search for where chatTargets get route
let from = 0;
let n = 0;
while (n < 8) {
  const i = page.indexOf("route:", from);
  if (i < 0) break;
  const slice = page.slice(i, i + 80);
  if (slice.includes("conversation") || slice.includes("chatgpt") || slice.includes("dt(") || slice.includes("`/")) {
    console.log("\n---", i, "---");
    console.log(page.slice(Math.max(0, i - 100), i + 150));
    n++;
  }
  from = i + 6;
}

// Find imported dt / conversation route helper - search exports used near chatTargets map
const jheImport = page.match(/Vt as Jhe/);
console.log("\nJhe import", jheImport);

// Find file exporting Vt as Jhe - from same remote bundle?
const importChunk = page.slice(0, 50000);
const m = importChunk.match(/Vt as Jhe/);
// Find the from for Vt
const fromMatch = importChunk.match(/Vt as Jhe[^}]*\}from"([^"]+)"/);
console.log("Jhe from", fromMatch?.[1]);
