#!/usr/bin/env node
"use strict";
/**
 * Clear sticky Chat overlay keys from the rebuild profile Local Storage.
 * No DevTools required.
 *
 * Usage:
 *   node scripts/clear-cdr-thread-extras.js           # delete all cdr-thread-extras:*
 *   node scripts/clear-cdr-thread-extras.js --map     # also clear cdr-thread-map
 *   node scripts/clear-cdr-thread-extras.js --dry-run
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync, execFileSync } = require("child_process");

const LEVELDIR = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Profile/Default/Local Storage/leveldb",
);

const dry = process.argv.includes("--dry-run");
const clearMap = process.argv.includes("--map");

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild\/Codex\.app|Codex\.payload/.test(line)) continue;
      if (/cursor-agent|grep|clear-cdr/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

function loadLevel() {
  try {
    return require("classic-level");
  } catch {
    console.log("Installing classic-level (one-time)…");
    execFileSync("npm", ["install", "--no-save", "classic-level@1.4.1"], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });
    return require("classic-level");
  }
}

async function main() {
  if (!fs.existsSync(LEVELDIR)) {
    throw new Error("Local Storage not found: " + LEVELDIR);
  }

  console.log("Quitting Codex so Local Storage is unlocked…");
  killCodex();
  // leveldb lock release
  await new Promise((r) => setTimeout(r, 1500));

  const { ClassicLevel } = loadLevel();
  const db = new ClassicLevel(LEVELDIR, {
    keyEncoding: "buffer",
    valueEncoding: "buffer",
  });

  const toDelete = [];
  for await (const [key] of db.iterator()) {
    const s = key.toString("utf8");
    // Chromium localStorage keys look like: _app://-\x00\x01<name>
    if (s.includes("cdr-thread-extras:")) toDelete.push(key);
    if (clearMap && s.includes("cdr-thread-map")) toDelete.push(key);
  }

  console.log(`Found ${toDelete.length} key(s)`);
  for (const key of toDelete) {
    const label = key.toString("utf8").replace(/[^\x20-\x7e]/g, ".");
    console.log(dry ? "would delete" : "delete", label.slice(-120));
    if (!dry) await db.del(key);
  }

  await db.close();
  console.log(
    dry
      ? "\nDry-run only. Re-run without --dry-run to apply."
      : "\nDone. Reopen Codex. Sticky/Chat bridge still work; only poisoned extras overlays were removed.",
  );
}

main().catch((err) => {
  console.error(err);
  console.error(
    "\nIf LevelDB is locked: fully quit Codex (Cmd+Q), wait 2s, run again.",
  );
  process.exit(1);
});
