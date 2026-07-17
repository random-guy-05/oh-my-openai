#!/usr/bin/env node
/**
 * patch-updater.js — Disable Sparkle (macOS) and Windows auto-updater
 *
 * AST match: in the file containing shouldIncludeSparkle / shouldIncludeUpdater,
 * find these method definitions and replace their bodies to return false.
 *
 * Specifically targets:
 *   shouldIncludeSparkle(e,t,n){return ...}  → return !1
 *   shouldIncludeWindowsUpdater(e,t,n){return ...}  → return !1
 *   shouldIncludeUpdater(e,t,n){return ...}  → return !1
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { locateBundles, relPath, SRC_DIR } = require("./patch-util");

const UPDATER_METHODS = new Set([
  "shouldIncludeSparkle",
  "shouldIncludeWindowsUpdater",
  "shouldIncludeWindowsMsixUpdater",
  "shouldIncludeUpdater",
]);

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child)
        if (item && typeof item === "object" && item.type) walk(item, visitor);
    } else if (child && typeof child === "object" && child.type) {
      walk(child, visitor);
    }
  }
}

function collectMethodStates(ast, source) {
  const states = [];

  walk(ast, (node) => {
    // Match: Property with key being an updater method name and value being a FunctionExpression
    if (node.type !== "Property") return;
    const keyName = node.key?.name || node.key?.value;
    if (!UPDATER_METHODS.has(keyName)) return;

    const fn = node.value;
    if (fn?.type !== "FunctionExpression") return;
    const body = fn.body;
    if (!body || body.type !== "BlockStatement") return;
    if (body.body.length !== 1) return;
    const ret = body.body[0];
    if (ret.type !== "ReturnStatement" || !ret.argument) return;

    const returnSource = source.slice(ret.argument.start, ret.argument.end);
    states.push({
      id: keyName,
      start: ret.argument.start,
      end: ret.argument.end,
      disabled:
        returnSource === "!1" ||
        (ret.argument.type === "Literal" && ret.argument.value === false),
      original:
        returnSource.length > 50
          ? returnSource.slice(0, 47) + "..."
          : returnSource,
    });
  });

  return states;
}

function verifyMethodSet(bundle, states) {
  const counts = new Map();
  for (const state of states) {
    counts.set(state.id, (counts.get(state.id) || 0) + 1);
  }
  const missing = [...UPDATER_METHODS].filter((id) => counts.get(id) !== 1);
  if (states.length !== UPDATER_METHODS.size || missing.length > 0) {
    throw new Error(
      `${relPath(bundle.path)}: updater method structure changed ` +
      `(found=${states.map((state) => state.id).join(",") || "none"})`,
    );
  }
}

function locateTargets(platform) {
  const platforms = platform
    ? [platform]
    : ["mac-arm64", "mac-x64", "win"].filter((p) =>
        fs.existsSync(path.join(SRC_DIR, p, "_asar", ".vite", "build")),
      );

  const targets = [];
  for (const plat of platforms) {
    const buildDir = path.join(SRC_DIR, plat, "_asar", ".vite", "build");
    if (!fs.existsSync(buildDir)) continue;
    for (const f of fs.readdirSync(buildDir)) {
      if (!f.endsWith(".js")) continue;
      const fp = path.join(buildDir, f);
      const src = fs.readFileSync(fp, "utf-8");
      if (
        src.includes("shouldIncludeSparkle") &&
        src.includes("shouldIncludeUpdater")
      ) {
        targets.push({ platform: plat, path: fp });
      }
    }
  }
  return targets;
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a));

  const targets = locateTargets(platform);
  if (targets.length === 0) {
    throw new Error("No updater marker bundles found");
  }

  const implementations = [];
  for (const bundle of targets) {
    console.log(`  [${bundle.platform}] ${relPath(bundle.path)}`);
    const source = fs.readFileSync(bundle.path, "utf-8");
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    const states = collectMethodStates(ast, source);
    if (states.length === 0) {
      console.log("    [skip] Marker-only consumer bundle; no updater implementation");
      continue;
    }
    verifyMethodSet(bundle, states);
    implementations.push({ bundle, source, states });
  }

  if (implementations.length === 0) {
    throw new Error("Updater markers were present but no complete updater implementation matched");
  }

  for (const { bundle, source, states } of implementations) {
    console.log(`  [verify ${bundle.platform}] ${relPath(bundle.path)}`);
    const patches = states.filter((state) => !state.disabled);
    if (isCheck) {
      if (patches.length === 0) {
        console.log(`    [ok] All ${UPDATER_METHODS.size} updater methods are disabled`);
      } else {
        console.log(`    [?] Would disable ${patches.length} updater method(s): ` +
          patches.map((patch) => patch.id).join(", "));
      }
      continue;
    }

    patches.sort((a, b) => b.start - a.start);
    let code = source;
    for (const p of patches) {
      console.log(`    * [${p.id}] ${p.original} -> !1`);
      code = code.slice(0, p.start) + "!1" + code.slice(p.end);
    }

    const verifiedAst = parse(code, { ecmaVersion: "latest", sourceType: "module" });
    const verifiedStates = collectMethodStates(verifiedAst, code);
    verifyMethodSet(bundle, verifiedStates);
    if (!verifiedStates.every((state) => state.disabled)) {
      throw new Error(`${relPath(bundle.path)}: updater disable verification failed`);
    }
    fs.writeFileSync(bundle.path, code, "utf-8");
    console.log(`    [ok] ${UPDATER_METHODS.size} updater methods verified disabled`);
  }
}

main();
