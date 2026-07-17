#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { USERDATA_FROM, USERDATA_TO, MARKER } = require("./patch-isolated-userdata");

const REBUILD =
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const BOOTSTRAP = path.join(
  REBUILD,
  "src/mac-x64/_asar/.vite/build/bootstrap-kaIwu5-H.js",
);
const ASAR_ROOT = path.join(REBUILD, "src/mac-x64/_asar");

function run(bin, args, opts = {}) {
  return execFileSync(bin, args, {
    encoding: "utf8",
    stdio: opts.stdio || ["ignore", "pipe", "pipe"],
  });
}

// 1) Quit live Codex runtime processes that stole the official profile
const ps = run("/bin/ps", ["auxww"]);
for (const line of ps.split("\n")) {
  if (!line.includes("CodexDesktop-Rebuild") || !line.includes("MacOS/ChatGPT")) continue;
  if (line.includes("Helper") || line.includes("Frameworks")) continue;
  const pid = Number(line.trim().split(/\s+/)[1]);
  if (!Number.isFinite(pid)) continue;
  console.log("killing runtime pid", pid);
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

// 2) Patch bootstrap in rebuild tree
let source = fs.readFileSync(BOOTSTRAP, "utf8");
if (!source.includes(MARKER)) {
  if (!source.includes(USERDATA_FROM)) {
    throw new Error("bootstrap ee() anchor missing");
  }
  source = source.split(USERDATA_FROM).join(USERDATA_TO);
  fs.writeFileSync(BOOTSTRAP, source);
  console.log("patched bootstrap");
} else {
  console.log("bootstrap already patched");
}
if (!fs.readFileSync(BOOTSTRAP, "utf8").includes(MARKER)) {
  throw new Error("bootstrap patch failed");
}

// 3) Pack + install live asars
const packed = path.join(REBUILD, "out", "app-isolated-userdata-v1.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
console.log("packing...");
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
  cwd: REBUILD,
  stdio: "inherit",
});

const live = [
  path.join(
    process.env.HOME,
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];
for (const dest of live) {
  if (!fs.existsSync(dest)) continue;
  const bak = `${dest}.bak-userdata-${Date.now()}`;
  fs.copyFileSync(dest, bak);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}

// 4) Re-sign
const bundles = [
  path.join(process.env.HOME, "Library/Application Support/CodexDesktop-Rebuild/Codex.app"),
  "/Applications/Codex.app/Contents/Resources/Codex.payload",
];
for (const bundle of bundles) {
  if (!fs.existsSync(bundle)) continue;
  const entitlements = path.join(os.tmpdir(), `codex-ent-${Date.now()}.plist`);
  let raw;
  try {
    raw = run("/usr/bin/codesign", ["--display", "--entitlements", ":-", bundle]);
  } catch (error) {
    raw = `${error.stdout || ""}`;
  }
  fs.writeFileSync(entitlements, raw);
  try {
    run("/usr/bin/plutil", ["-lint", entitlements]);
  } catch {
    const xml = `${entitlements}.xml`;
    run("/usr/bin/plutil", ["-convert", "xml1", "-o", xml, entitlements]);
    fs.renameSync(xml, entitlements);
  }
  console.log("signing", bundle);
  run("/usr/bin/codesign", [
    "--force",
    "--sign",
    "-",
    "--timestamp=none",
    "--options",
    "runtime",
    "--entitlements",
    entitlements,
    bundle,
  ]);
  run("/usr/bin/codesign", ["--verify", "--strict", bundle]);
  fs.unlinkSync(entitlements);
  console.log("signature ok", bundle);
}

console.log("done — open ONLY /Applications/Codex.app (the launcher), not the runtime binary");
