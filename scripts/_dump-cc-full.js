#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const os = require("os");
const root =
  os.homedir() +
  "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const local = asar
  .extractFile(root, "webview/assets/local-conversation-thread-Bnxyo76e.js")
  .toString("utf8");

// Extract CC properly — skip param braces
function extractAfterParams(src, name) {
  const start = src.indexOf(name);
  if (start < 0) return null;
  const brace = src.indexOf("){", start);
  if (brace < 0) return null;
  const bodyStart = brace + 1; // at {
  let depth = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

for (const name of [
  "function CC({",
  "function NC(",
  "function gS(e,t){",
]) {
  const fn = extractAfterParams(local, name.includes("(") ? name.replace(/\($/, "") : name);
  // simpler search
}

const ccStart = local.indexOf("function CC({");
const ccBrace = local.indexOf("){", ccStart);
let depth = 0;
let ccEnd = -1;
for (let i = ccBrace + 1; i < local.length; i++) {
  if (local[i] === "{") depth++;
  else if (local[i] === "}") {
    depth--;
    if (depth === 0) {
      ccEnd = i + 1;
      break;
    }
  }
}
console.log("CC full:\n", local.slice(ccStart, ccEnd));

// D.map harden
const d = local.indexOf("harden-D-map");
console.log("\nD-map", local.slice(Math.max(0, d - 150), d + 200));

const nc = local.indexOf("harden-NC");
console.log("\nNC", local.slice(Math.max(0, nc - 150), nc + 250));

const hf = local.indexOf("harden-find");
console.log("\nharden-find", local.slice(Math.max(0, hf - 100), hf + 250));

// Search unguarded .turn in local that could throw on render
const re = /[^?]\.turn\.[a-zA-Z]/g;
let m,
  n = 0;
const risky = [];
while ((m = re.exec(local)) && n < 200) {
  const ctx = local.slice(Math.max(0, m.index - 40), m.index + 60);
  if (!ctx.includes("?.turn") && !ctx.includes("e&&e.turn") && !ctx.includes("!r.turn") && !ctx.includes("e.turn&&")) {
    // still might be guarded differently
    if (/(\w+)\.turn\./.test(ctx)) {
      const base = ctx.match(/(\w+)\.turn\./)?.[1];
      if (base && !["r", "V"].includes(base)) {
        // skip some
      }
      risky.push(ctx.replace(/\n/g, " "));
    }
  }
  n++;
}
console.log("\nrisky .turn samples", risky.length);
for (const r of [...new Set(risky)].slice(0, 30)) console.log(r);
