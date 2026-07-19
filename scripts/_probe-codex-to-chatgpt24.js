#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");

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

const ast = parse(page, { ecmaVersion: "latest", sourceType: "module" });
for (const name of ["q_e", "aAe", "nL", "tL"]) {
  let node = null;
  walk(ast, (n) => {
    if (n.type === "FunctionDeclaration" && n.id?.name === name) node = n;
  });
  if (!node) {
    console.log(name, "missing");
    continue;
  }
  const body = page.slice(node.start, Math.min(node.end, node.start + 1500));
  console.log("\n#####", name, "len", node.end - node.start);
  console.log(body.slice(0, 1200));
}
