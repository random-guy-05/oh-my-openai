#!/usr/bin/env node
/**
 * enhancement-tool.js — invoke a bundled enhancement tool inside a built app.
 *
 * Tools are staged at build time (see enhancements/manifest.json and
 * scripts/bundle-enhancements.js) but are not started by the launcher. This
 * runner executes a tool's toolCommand from its staged directory with
 * CODEX_HOME pointed at the app's isolated CodexHome. Native app enhancements
 * are opened by the launcher and are not invoked through this CLI runner.
 *
 * Usage:
 *   node scripts/enhancement-tool.js <Codex.app> --list
 *   node scripts/enhancement-tool.js <Codex.app> <id> [args...]
 *
 * Examples:
 *   node scripts/enhancement-tool.js out/side-by-side-mac-x64/Codex.app --list
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SUPPORT_REL = path.join("Library", "Application Support", "CodexDesktop-Rebuild");
const ENHANCEMENTS_REL = path.join("Contents", "Resources", "enhancements");

function main() {
  const args = process.argv.slice(2);
  const appPath = path.resolve(args[0] || "");
  const id = args[1];
  const toolArgs = args.slice(2);
  if (!fs.existsSync(appPath)) {
    console.error(`Usage: node scripts/enhancement-tool.js <Codex.app> <id> [args...]`);
    console.error(`       node scripts/enhancement-tool.js <Codex.app> --list`);
    process.exit(2);
  }

  const enhancementsDir = path.join(appPath, ENHANCEMENTS_REL);
  const manifestPath = path.join(enhancementsDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`No enhancement manifest at ${manifestPath} (was the app built with enhancements?)`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  if (id === "--list") {
    console.log(`Enhancements in ${appPath}:`);
    for (const enhancement of manifest.enhancements) {
      const suffix = enhancement.type === "service"
        ? `service (port ${enhancement.config && enhancement.config.port})`
      : enhancement.appPath
        ? `native app — ${enhancement.appPath}`
        : `tool${enhancement.toolCommand ? " — " + enhancement.toolCommand.join(" ") : ""}`;
      console.log(`  ${enhancement.id}  [${suffix}]`);
    }
    return;
  }

  const enhancement = manifest.enhancements.find((e) => e.id === id);
  if (!enhancement) {
    console.error(`Unknown enhancement id "${id}". Run with --list to see available enhancements.`);
    process.exit(1);
  }
  if (!enhancement.toolCommand || enhancement.toolCommand.length === 0) {
    console.error(`Enhancement ${id} is a native app or otherwise has no toolCommand; open it from the Codex command center.`);
    process.exit(1);
  }

  const enhancementDir = path.join(enhancementsDir, id);
  if (!fs.existsSync(enhancementDir)) {
    console.error(`Staged directory missing: ${enhancementDir}`);
    process.exit(1);
  }

  const [command, ...commandArgs] = enhancement.toolCommand;
  const resolved = command.includes("/")
    ? command
    : resolveFromPath(command);
  if (!resolved) {
    console.error(`toolCommand[0] "${command}" not found in PATH and is not a path`);
    process.exit(1);
  }

  const supportDir = path.join(os.homedir(), SUPPORT_REL);
  const result = spawnSync(resolved, [...commandArgs, ...toolArgs], {
    cwd: enhancementDir,
    stdio: "inherit",
    env: {
      ...process.env,
      CODEX_HOME: path.join(supportDir, "CodexHome"),
      CODEX_ELECTRON_USER_DATA_PATH: path.join(supportDir, "Profile"),
    },
  });
  process.exit(result.status === null ? 1 : result.status);
}

function resolveFromPath(command) {
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

main();
