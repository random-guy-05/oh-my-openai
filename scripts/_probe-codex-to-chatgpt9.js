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

const ast = parse(remote, { ecmaVersion: "latest", sourceType: "module" });
const matches = [];
walk(ast, (node) => {
  if (node.type === "FunctionDeclaration" && node.id?.name === "Tc") matches.push(node);
  if (node.type === "VariableDeclarator" && node.id?.name === "Tc") matches.push(node);
});
console.log("Tc matches", matches.length);
for (const node of matches) {
  console.log("\n=== Tc", node.type, node.start, node.end, "len", node.end - node.start, "===");
  console.log(remote.slice(node.start, Math.min(node.end, node.start + 2500)));
}

// Also search for Tc=
for (const needle of ["function Tc(", "async function Tc(", "Tc=async", "Tc=e=>", "Tc=function", ",Tc=", "let Tc=", "const Tc="]) {
  console.log(needle, remote.indexOf(needle));
}
