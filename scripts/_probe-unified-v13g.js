#!/usr/bin/env node
"use strict";
const fs = require("fs");
const { parse } = require("acorn");
const page = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
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
const ast = parse(page, { ecmaVersion: "latest", sourceType: "module" });
let mje;
walk(ast, (n) => {
  if (n.type === "FunctionDeclaration" && n.id?.name === "mje") mje = n;
});
const body = page.slice(mje.start, mje.start + 2500);
console.log(body);
console.log("\n--- has qx", body.includes("qx"));
console.log("has Aw", body.includes("Aw"));
console.log("has Cn", body.includes("Cn"));
