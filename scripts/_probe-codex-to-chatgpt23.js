#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~appgen-settings-page~pull-request-route~onboarding-page~settings-page~~iaab4bzx-BHK3miry.js",
  ),
  "utf8",
);
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

const ast = parse(settings, { ecmaVersion: "latest", sourceType: "module" });
const matches = [];
walk(ast, (n) => {
  if (n.type === "FunctionDeclaration" && n.id?.name === "Tc") matches.push(n);
});
console.log("Tc count in settings", matches.length);
for (const n of matches) {
  console.log(settings.slice(n.start, Math.min(n.end, n.start + 800)));
}

// Find bE in page imports
const be = page.match(/([A-Za-z0-9_$]+) as bE[,}]/);
console.log("\nbE import", be?.[0]);
const beFrom = (() => {
  const i = page.indexOf(" as bE");
  const fromIdx = page.indexOf("}from\"", i);
  return page.slice(fromIdx).match(/\}from"([^"]+)"/)?.[1];
})();
console.log("bE from", beFrom);

// Also find path builder S used by Aw - in remote as import
const remote = fs.readFileSync(
  path.join(assets, "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js"),
  "utf8",
);
// S( used in Tc - find import ` as S,` near thread path - look at bindings around mn and S
for (const name of ["mn", "S"]) {
  // Find VariableDeclarator or import
  const re = new RegExp(`[\\w$]+ as ${name}[,}]`);
  const m = remote.match(re);
  console.log(name, "import match", m?.[0]);
}

// Dump export of path helpers from settings related to local routes
for (const needle of ["function QG(", "QG=e=>", "`/local/${", "function n_t(", "function pu("]) {
  const i = settings.indexOf(needle);
  console.log(needle, i);
  if (i >= 0) console.log(settings.slice(i, i + 250));
}
