#!/usr/bin/env node
"use strict";

/**
 * Reduce the detached in-app-browser renderer working set.
 *
 * Upstream keeps as many as 32 detached browser pages alive for 30 minutes.
 * The existing manager already protects active, loading, audio, and captured
 * pages and suspends/destroys only inactive detached pages. This patch keeps
 * that lifecycle and only lowers its defaults:
 *   - 8 detached pages
 *   - 10 minute protected working set
 *
 * Both values remain configurable through the launcher environment:
 *   CODEX_REBUILD_BROWSER_TAB_BUDGET=2..32
 *   CODEX_REBUILD_BROWSER_TAB_WORKING_SET_MINUTES=1..60
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { SRC_DIR, relPath } = require("./patch-util");

const MARKER = "codex-rebuild:resource-saver-v1";
const BUDGET_ENV = "CODEX_REBUILD_BROWSER_TAB_BUDGET";
const WORKING_SET_ENV = "CODEX_REBUILD_BROWSER_TAB_WORKING_SET_MINUTES";

const UPSTREAM_CONSTANTS =
  /var ([A-Za-z_$][\w$]*)=32,([A-Za-z_$][\w$]*)=30\*6e4,([A-Za-z_$][\w$]*)=class\{/g;

function replacement(budgetName, expiryName, className) {
  return (
    `var /* ${MARKER} */${budgetName}=(()=>{` +
    `let e=Number(process.env.${BUDGET_ENV}??8);` +
    `return Number.isFinite(e)?Math.max(2,Math.min(32,Math.floor(e))):8` +
    `})(),${expiryName}=(()=>{` +
    `let e=Number(process.env.${WORKING_SET_ENV}??10);` +
    `return(Number.isFinite(e)?Math.max(1,Math.min(60,e)):10)*6e4` +
    `})(),${className}=class{`
  );
}

function parseBundle(source, filePath) {
  try {
    parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${relPath(filePath)} failed to parse: ${error.message}`);
  }
}

function verify(source, filePath) {
  for (const needle of [MARKER, BUDGET_ENV, WORKING_SET_ENV]) {
    if (!source.includes(needle)) {
      throw new Error(`${relPath(filePath)} missing ${needle}`);
    }
  }
  if (!source.includes("browser-tab-budget-suspension-selected")) {
    throw new Error(`${relPath(filePath)} lost browser budget lifecycle marker`);
  }
  parseBundle(source, filePath);
}

function patchSource(source, filePath) {
  if (source.includes(MARKER)) {
    verify(source, filePath);
    return source;
  }
  const matches = [...source.matchAll(UPSTREAM_CONSTANTS)];
  if (matches.length !== 1) {
    throw new Error(
      `${relPath(filePath)} expected one detached-page budget declaration, found ${matches.length}`,
    );
  }
  const match = matches[0];
  const next =
    source.slice(0, match.index) +
    replacement(match[1], match[2], match[3]) +
    source.slice(match.index + match[0].length);
  verify(next, filePath);
  return next;
}

function locateTargets(platform) {
  const platforms = platform
    ? [platform]
    : ["mac-arm64", "mac-x64", "win"].filter((candidate) =>
        fs.existsSync(path.join(SRC_DIR, candidate, "_asar", ".vite", "build")),
      );
  const targets = [];
  for (const candidate of platforms) {
    const buildDir = path.join(SRC_DIR, candidate, "_asar", ".vite", "build");
    if (!fs.existsSync(buildDir)) continue;
    const matches = fs
      .readdirSync(buildDir)
      .filter((name) => name.endsWith(".js"))
      .map((name) => path.join(buildDir, name))
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, "utf8");
        return (
          source.includes("browser-tab-budget-suspension-selected") &&
          (source.includes(MARKER) ||
            (source.includes("=32,") && source.includes("=30*6e4")))
        );
      });
    if (matches.length !== 1) {
      throw new Error(
        `${candidate}: expected one browser resource manager, found ${matches.length}`,
      );
    }
    targets.push({ platform: candidate, path: matches[0] });
  }
  if (targets.length === 0) {
    throw new Error("No browser resource manager bundles found");
  }
  return targets;
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const platform = args.find((arg) =>
    ["mac-arm64", "mac-x64", "win"].includes(arg),
  );
  for (const target of locateTargets(platform)) {
    const source = fs.readFileSync(target.path, "utf8");
    const next = patchSource(source, target.path);
    if (checkOnly) {
      console.log(
        `  [ok] ${target.platform}: resource saver is ${
          next === source ? "installed" : "patchable"
        }`,
      );
      continue;
    }
    if (next !== source) fs.writeFileSync(target.path, next);
    console.log(
      `  [ok] ${target.platform}: detached browser budget defaults to 8 pages / 10 minutes`,
    );
  }
}

module.exports = {
  patchSource,
  locateTargets,
  verify,
  replacement,
  MARKER,
};

if (require.main === module) main();
