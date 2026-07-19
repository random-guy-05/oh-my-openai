#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const remote = fs.readFileSync(
  path.join(assets, "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js"),
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

function findFn(name) {
  const ast = parse(remote, { ecmaVersion: "latest", sourceType: "module" });
  const matches = [];
  walk(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === name) matches.push(node);
  });
  return matches;
}

for (const name of ["Tc", "Ec", "mn", "S", "Do"]) {
  const matches = findFn(name);
  console.log("\n====", name, "count", matches.length);
  for (const node of matches.slice(0, 3)) {
    console.log(remote.slice(node.start, Math.min(node.end, node.start + 1200)));
  }
}

// Also dump around Ec/mn/S if short
console.log("\n==== context around Tc ====");
console.log(remote.slice(23000, 24000));
