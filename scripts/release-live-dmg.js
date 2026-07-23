#!/usr/bin/env node
"use strict";
/**
 * Build a side-by-side DMG from the EXACT live rebuild app, then publish
 * it as a GitHub Release on origin (oh-my-openai).
 *
 * Usage:
 *   node scripts/release-live-dmg.js
 *   node scripts/release-live-dmg.js --tag v26.715.31925-sticky.1
 *   node scripts/release-live-dmg.js --skip-build   # upload existing DMG only
 *   node scripts/release-live-dmg.js --draft
 *
 * Requires: gh auth login, macOS, live app at:
 *   ~/Library/Application Support/CodexDesktop-Rebuild/Codex.app
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const LIVE = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app",
);
const OUT = path.join(ROOT, "out");

function run(bin, args, opts = {}) {
  console.log("+", bin, args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" "));
  return execFileSync(bin, args, {
    cwd: ROOT,
    stdio: opts.stdio || "inherit",
    encoding: opts.encoding,
  });
}

function runCapture(bin, args) {
  return execFileSync(bin, args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function parseArgs(argv) {
  const out = { tag: null, skipBuild: false, draft: false, title: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-build") out.skipBuild = true;
    else if (a === "--draft") out.draft = true;
    else if (a === "--tag") {
      out.tag = argv[++i];
      if (!out.tag) throw new Error("--tag requires a value");
    } else if (a === "--title") {
      out.title = argv[++i];
      if (!out.title) throw new Error("--title requires a value");
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  return out;
}

function plist(app, key) {
  return runCapture("/usr/bin/plutil", [
    "-extract",
    key,
    "raw",
    path.join(app, "Contents/Info.plist"),
  ]);
}

function killLiveCodex() {
  try {
    const ps = runCapture("/bin/ps", ["axo", "pid=,command="]);
    for (const line of ps.split("\n")) {
      if (!line.includes("CodexDesktop-Rebuild/Codex.app")) continue;
      if (/cursor-agent|grep|release-live/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[0]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(path.join(LIVE, "Contents/Resources/app.asar"))) {
    throw new Error(`Live app missing: ${LIVE}`);
  }

  const version = plist(LIVE, "CFBundleShortVersionString");
  const build = plist(LIVE, "CFBundleVersion");
  const tag = args.tag || `v${version}-sticky.1`;
  const title = args.title || `Codex Intel ${version} (sticky Chat build ${build})`;
  const dmgName = `Codex-side-by-side-mac-x64-${version}.dmg`;
  const dmgPath = path.join(OUT, dmgName);
  const releaseDmgName = `Codex-side-by-side-mac-x64-${version}-sticky.dmg`;
  const releaseDmgPath = path.join(OUT, releaseDmgName);

  console.log("live:", LIVE);
  console.log("version:", version, "build:", build);
  console.log("tag:", tag);
  console.log("dmg:", dmgPath);

  if (!args.skipBuild) {
    killLiveCodex();
    console.log("\n=== codesign verify live (can take several minutes) ===");
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", LIVE]);

    console.log("\n=== build side-by-side DMG from live runtime ===");
    console.log("(ditto + resign + hdiutil — often 10–20 minutes)\n");
    run(process.execPath, [
      path.join(ROOT, "scripts/build-side-by-side-mac.js"),
      "--runtime",
      LIVE,
    ]);
  }

  if (!fs.existsSync(dmgPath)) {
    throw new Error(`DMG not found after build: ${dmgPath}`);
  }

  fs.copyFileSync(dmgPath, releaseDmgPath);
  const sizeMb = (fs.statSync(releaseDmgPath).size / (1024 * 1024)).toFixed(1);
  console.log(`\nDMG ready: ${releaseDmgPath} (${sizeMb} MB)`);

  // Ensure we're pushing release against current main tip
  let sha = "HEAD";
  try {
    sha = runCapture("git", ["rev-parse", "HEAD"]);
  } catch {}

  const notes = [
    `Exact current live rebuild packaged as a side-by-side Intel DMG.`,
    ``,
    `- App version: \`${version}\``,
    `- Bundle version: \`${build}\``,
    `- Source runtime: \`~/Library/Application Support/CodexDesktop-Rebuild/Codex.app\``,
    `- Git: \`${sha.slice(0, 9)}\``,
    ``,
    `Includes sticky Chat continuity / ChatGPT usage bridge apply scripts through sticky-chat-v47.`,
    ``,
    `Install: open the DMG → drag **Codex** to Applications.`,
  ].join("\n");

  const notesFile = path.join(OUT, `_release-notes-${tag.replace(/[^\w.-]/g, "_")}.md`);
  fs.writeFileSync(notesFile, notes);

  // Replace existing tag/release if re-run
  try {
    run("gh", ["release", "view", tag, "-R", "random-guy-05/oh-my-openai"], {
      stdio: "pipe",
    });
    console.log(`\nRelease ${tag} exists — deleting so we can recreate`);
    run("gh", ["release", "delete", tag, "-R", "random-guy-05/oh-my-openai", "--yes", "--cleanup-tag"]);
  } catch {
    // does not exist
  }

  const ghArgs = [
    "release",
    "create",
    tag,
    releaseDmgPath,
    "-R",
    "random-guy-05/oh-my-openai",
    "--title",
    title,
    "--notes-file",
    notesFile,
    "--target",
    "main",
  ];
  if (args.draft) ghArgs.push("--draft");

  console.log("\n=== create GitHub release ===");
  run("gh", ghArgs);

  const url = runCapture("gh", [
    "release",
    "view",
    tag,
    "-R",
    "random-guy-05/oh-my-openai",
    "--json",
    "url",
    "-q",
    ".url",
  ]);
  console.log("\nSUCCESS");
  console.log(url);
}

main();
