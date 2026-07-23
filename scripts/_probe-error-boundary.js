#!/usr/bin/env node
"use strict";
/**
 * Patch error boundary to surface real error.message (and stash in localStorage)
 * so thread-open crashes are diagnosable. Also used as permanent UX improvement
 * for rebuild builds — still says Oops but appends the message.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:error-boundary-v52";

const PAGE = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("ogh9jurw") && f.endsWith(".js")),
);
const LIVE = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

function assert(c, m) {
  if (!c) throw new Error(m);
}
function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1 got ${n}`);
  return src.replace(from, to);
}

let src = fs.readFileSync(PAGE, "utf8");

// Find the generic error message jsx usage and enhance the component that renders it.
// Pattern from dump:
// n=(0,sP.jsx)(Y,{id:`codex.errorBoundary.genericError`,defaultMessage:`Oops, an error has occurred`,...})
// We need the component that has access to error — search for componentDidCatch / getDerivedStateFromError / errorBoundary

const anchors = [];
for (const needle of [
  "codex.errorBoundary.genericError",
  "getDerivedStateFromError",
  "componentDidCatch",
  "errorBoundary",
]) {
  let i = 0;
  while ((i = src.indexOf(needle, i)) >= 0) {
    anchors.push({ needle, i });
    i += needle.length;
  }
}
console.log(
  "anchors",
  anchors.map((a) => a.needle + "@" + a.i),
);

// Dump surrounding for getDerivedStateFromError / component that shows Oops
const oops = src.indexOf("codex.errorBoundary.genericError");
console.log("oops context:\n", src.slice(Math.max(0, oops - 800), oops + 600));

const gds = src.indexOf("getDerivedStateFromError");
if (gds >= 0) console.log("\ngds:\n", src.slice(gds - 200, gds + 500));

const cdc = src.indexOf("componentDidCatch");
if (cdc >= 0) console.log("\ncdc:\n", src.slice(cdc - 200, cdc + 500));
