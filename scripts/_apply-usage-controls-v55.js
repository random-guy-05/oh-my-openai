#!/usr/bin/env node
"use strict";
/**
 * Apply patch-usage-controls.js to the live Codex ASARs:
 *   kill codex → run patch-usage-controls against src tree → pack src/mac-x64/_asar
 *   → back up + install to each LIVE_ASARS target → resign → verify markers.
 *
 * Use --check to dry-run (no pack/install).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src", "mac-x64", "_asar");
const PACKED = path.join(ROOT, "out", "app-usage-controls-v55.asar");
const PATCHER = path.join(ROOT, "scripts", "patch-usage-controls.js");

const LIVE_ASARS = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher|Codex\.app|Codex\.payload/.test(line))
        continue;
      if (/cursor-agent|grep|_apply-usage|patch-usage/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

function verifyInstalledAsar(asarPath) {
  const { extractAll } = require("@electron/asar");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cdr-usage-v55-"));
  try {
    extractAll(asarPath, tmp);
    const assets = path.join(tmp, "webview", "assets");
    const sendFile = fs
      .readdirSync(assets)
      .find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"));
    assert(sendFile, `missing SEND bundle (oxnpxkxc) in ${asarPath}`);
    const send = fs.readFileSync(path.join(assets, sendFile), "utf8");
    assert(
      send.includes("codex-rebuild:usage-observer-v1"),
      `${asarPath} missing usage-observer-v1 marker in SEND bundle`,
    );
    assert(
      send.includes("codex-rebuild:usage-guard-v1"),
      `${asarPath} missing usage-guard-v1 marker in SEND bundle`,
    );
    assert(
      send.includes("globalThis.__cdrUsageV1?.observe"),
      `${asarPath} missing observe() call site`,
    );
    console.log("installed verify ok", asarPath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const checkOnly = process.argv.includes("--check");

  killCodex();
  assert(fs.existsSync(ASAR_ROOT), `ASAR_ROOT missing: ${ASAR_ROOT}`);
  console.log("applying patch-usage-controls to src tree");
  execFileSync("node", [PATCHER], { cwd: ROOT, stdio: "inherit" });

  if (checkOnly) {
    console.log("--check: stopping before pack/install");
    return;
  }

  console.log("packing", PACKED);
  fs.mkdirSync(path.dirname(PACKED), { recursive: true });
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, PACKED], {
    cwd: ROOT,
    stdio: "inherit",
  });

  for (const dest of LIVE_ASARS) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    const backup = `${dest}.bak-pre-usage-v55-${Date.now()}`;
    fs.copyFileSync(dest, backup);
    fs.copyFileSync(PACKED, dest);
    console.log("installed", dest, "(backup:", backup + ")");
    verifyInstalledAsar(dest);
  }

  console.log("re-signing live runtime");
  try {
    execFileSync("node", [path.join(ROOT, "scripts", "_resign-live-runtime.js")], {
      cwd: ROOT,
      stdio: "inherit",
    });
  } catch (error) {
    console.error("re-sign step failed:", error.message);
    process.exitCode = 1;
  }

  console.log(
    "\nSUCCESS — fully quit Codex, reopen, set /limits caps; chat turns will now enforce the per-task token cap live.",
  );
}

main();
