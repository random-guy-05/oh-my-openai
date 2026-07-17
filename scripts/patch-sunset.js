/**
 * Post-build patch: Disable appSunset forced-update gate
 *
 * Codex uses a Statsig gate to control version sunsetting.
 * When the gate returns true, a full-screen "Update Required" overlay blocks the UI.
 *
 * AST match: identify the sunset UI component, then replace only the numeric
 * gate call used as the condition of the branch that renders that component.
 *
 * Usage:
 *   node scripts/patch-sunset.js [platform]   # Apply patch (unix/win/omit=both)
 *   node scripts/patch-sunset.js --check      # Dry-run: report matches
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { relPath, SRC_DIR } = require("./patch-util");

// ──────────────────────────────────────────────
//  AST walker
// ──────────────────────────────────────────────

function walk(node, visitor, parent) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node, parent);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) {
          walk(item, visitor, node);
        }
      }
    } else if (child && typeof child === "object" && child.type) {
      walk(child, visitor, node);
    }
  }
}

// ──────────────────────────────────────────────
//  Patch rule
// ──────────────────────────────────────────────

// Structural markers for sunset functions (i18n keys present in the sunset UI)
const SUNSET_MARKERS = ["appSunset", "app.sunset", "sunset"];
const PATCH_MARKER = "codex-rebuild:sunset-disabled";

function getLiteralValue(node) {
  if (!node) return null;
  if (node.type === "Literal") return node.value;
  if (
    node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  )
    return node.quasis[0].value.cooked;
  return null;
}

function functionBindingName(node, parent) {
  if (node.id?.type === "Identifier") return node.id.name;
  if (
    parent?.type === "VariableDeclarator" &&
    parent.init === node &&
    parent.id?.type === "Identifier"
  ) {
    return parent.id.name;
  }
  return null;
}

function branchRendersSunset(node, source, sunsetComponents) {
  if (SUNSET_MARKERS.some((marker) => source.slice(node.start, node.end).includes(marker))) {
    return true;
  }
  let found = false;
  walk(node, (child) => {
    if (child.type === "Identifier" && sunsetComponents.has(child.name)) {
      found = true;
    }
  });
  return found;
}

function isNumericGateCall(node) {
  if (node?.type !== "CallExpression") return false;
  if (node.callee?.type !== "Identifier" || node.arguments?.length !== 1) return false;
  const value = getLiteralValue(node.arguments[0]);
  return typeof value === "string" && /^\d{6,}$/.test(value);
}

function isDisabledTest(node) {
  return (
    (node?.type === "UnaryExpression" &&
      node.operator === "!" &&
      node.argument?.type === "Literal" &&
      node.argument.value === 1) ||
    (node?.type === "Literal" && node.value === false)
  );
}

function collectGateStates(ast, source) {
  const states = [];
  const sunsetComponents = new Set();

  walk(ast, (node, parent) => {
    if (
      node.type !== "FunctionDeclaration" &&
      node.type !== "FunctionExpression" &&
      node.type !== "ArrowFunctionExpression"
    ) {
      return;
    }
    if (!source.slice(node.start, node.end).includes("appSunset.title")) return;
    const name = functionBindingName(node, parent);
    if (name) sunsetComponents.add(name);
  });

  walk(ast, (node) => {
    if (node.type !== "IfStatement" && node.type !== "ConditionalExpression") return;
    if (!branchRendersSunset(node.consequent, source, sunsetComponents)) return;
    if (!isNumericGateCall(node.test) && !isDisabledTest(node.test)) return;

    states.push({
      start: node.test.start,
      end: node.test.end,
      disabled: isDisabledTest(node.test),
      original: source.slice(node.test.start, node.test.end),
    });
  });

  return states;
}

function locateTargets(platform) {
  const requested = platform
    ? [platform]
    : ["mac-arm64", "mac-x64", "win"];
  const targets = [];
  for (const item of requested) {
    const assetsDir = path.join(SRC_DIR, item, "_asar", "webview", "assets");
    if (!fs.existsSync(assetsDir)) continue;
    for (const filename of fs.readdirSync(assetsDir)) {
      if (!filename.endsWith(".js")) continue;
      const bundlePath = path.join(assetsDir, filename);
      const source = fs.readFileSync(bundlePath, "utf-8");
      if (source.includes("appSunset.title") && source.includes("defaultMessage")) {
        targets.push({ platform: item, path: bundlePath });
      }
    }
  }
  return targets;
}

// ──────────────────────────────────────────────
//  Main
// ──────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a));

  const bundles = locateTargets(platform);

  if (bundles.length === 0) {
    console.error("[x] No sunset UI bundle found");
    process.exit(1);
  }

  const analyses = bundles.map((bundle) => {
    console.log(`\n-- [${bundle.platform}] ${relPath(bundle.path)}`);
    const source = fs.readFileSync(bundle.path, "utf-8");
    console.log(`   size: ${(source.length / 1024 / 1024).toFixed(1)} MB`);

    const t0 = Date.now();
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    console.log(`   parse: ${Date.now() - t0}ms`);

    const states = collectGateStates(ast, source);
    if (states.length !== 1) {
      throw new Error(
        `${relPath(bundle.path)}: expected exactly one sunset gate, found ${states.length}`,
      );
    }
    return { bundle, source, state: states[0] };
  });

  for (const { bundle, source, state } of analyses) {
    if (state.disabled) {
      console.log(
        source.includes(PATCH_MARKER)
          ? "   [ok] Sunset gate already disabled and marked"
          : "   [ok] Sunset gate already disabled",
      );
      continue;
    }
    if (isCheck) {
      console.log(`   [?] offset ${state.start}: ${state.original} -> !1`);
      continue;
    }

    console.log(`   * offset ${state.start}: ${state.original} -> !1`);
    const replacement = `!1/* ${PATCH_MARKER} */`;
    const code = source.slice(0, state.start) + replacement + source.slice(state.end);
    const verifiedAst = parse(code, { ecmaVersion: "latest", sourceType: "module" });
    const verifiedStates = collectGateStates(verifiedAst, code);
    if (
      verifiedStates.length !== 1 ||
      !verifiedStates[0].disabled ||
      !code.includes(PATCH_MARKER)
    ) {
      throw new Error(`${relPath(bundle.path)}: sunset patch verification failed`);
    }
    fs.writeFileSync(bundle.path, code, "utf-8");
    console.log("   [ok] Sunset gate disabled and structurally verified");
  }
}

main();
