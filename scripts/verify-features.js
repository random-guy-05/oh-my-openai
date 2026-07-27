#!/usr/bin/env node
"use strict";

/**
 * Behavioural verification gate for the custom-feature patches.
 *
 * WHY THIS EXISTS
 * ---------------
 * The previous verification greped for marker comments that the patch
 * scripts had just written themselves, e.g.
 *
 *   function CDRTaskUsageBadge({threadId}){"/* …:task-usage-badge *\/"
 *
 * A marker proves only that the patcher emitted text. It cannot detect a
 * feature that failed to install, and it cannot detect a feature that
 * installed but references identifiers that no longer exist in the rebased
 * bundle. Both happened during the 26.721 rebase: patch-usage-controls.js
 * soft-failed and shipped nothing, while a replacement script shipped
 * badges that passed every marker check.
 *
 * This verifier asserts observable properties of the patched bundle:
 *
 *   present   — code (not comments) that must exist
 *   absent    — the pristine upstream anchor that must be GONE, which is
 *               the only proof a replacement actually happened
 *   mounted   — an injected component must be referenced somewhere other
 *               than its own declaration, i.e. it is actually rendered
 *   resolves  — every free identifier an injected function references must
 *               resolve to a real top-level binding or a known global.
 *               This is what catches minifier drift (U8 -> W8, Nka -> Pka)
 *               before it reaches a DMG.
 *
 * Usage:
 *   node scripts/verify-features.js [mac-x64]
 *   node scripts/verify-features.js --json
 */

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");

// ─── Globals an injected function is allowed to reference freely ───

const KNOWN_GLOBALS = new Set([
  "globalThis", "window", "document", "localStorage", "sessionStorage",
  "console", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "Math", "Date", "Promise", "Map", "Set", "WeakMap", "WeakSet", "Symbol",
  "Error", "TypeError", "RangeError", "RegExp", "Intl", "crypto",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
  "CustomEvent", "Event", "EventTarget", "AbortController", "fetch",
  "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "structuredClone",
  "encodeURIComponent", "decodeURIComponent", "isNaN", "isFinite",
  "parseInt", "parseFloat", "undefined", "NaN", "Infinity",
  "arguments", "this", "navigator", "performance", "BigInt", "Proxy",
  "Reflect", "process",
]);

// ─── Feature manifest ───────────────────────────────────────────────
//
// Each entry names the patch script that owns it, so a failure points at
// the thing that has to be fixed rather than at this file.

const FEATURES = [
  {
    id: "usage-panel",
    owner: "patch-usage-controls.js",
    bundle: "app-initial",
    critical: true,
    description: "Honest thread-level usage panel (exact AppServer counters)",
    present: [
      ["CDRUsageDetails", "usage details component"],
      ["Last turn:", "per-thread last-turn row"],
      ["Cache hit:", "prompt-cache row"],
      ["Observed quota:", "quota-delta row"],
    ],
    resolves: [],
    mounted: [],
  },
  {
    id: "local-canonical-mode",
    owner: "patch-local-canonical-mode.js",
    bundle: "app-initial",
    critical: true,
    description: "Chat / Work / Codex presets on the same native task",
    present: [
      ["let CDRRuntime=", "mode runtime binding"],
      [["CDRSetMode(`chat`)", "CDRSetMode(CDRM)"], "chat preset selection"],
      ["CDRRuntime.registerModelController(", "model picker sync"],
      ["__cdrLocalModeV4", "mode runtime global"],
    ],
    resolves: [],
    mounted: [],
  },
  {
    id: "chat-model-catalog",
    owner: "_apply-26721-all-features.js",
    bundle: "app-initial",
    critical: true,
    description: "ChatGPT model catalog exposed to the picker",
    present: [["CDRMergeChatModels(_r)", "catalog hook wired into models()"]],
    // Proof the replacement landed: the pristine call must no longer exist.
    absent: [
      ["P_a(await this.request.getModelsResponse())", "unhooked models() call"],
    ],
    resolves: ["CDRMergeChatModels"],
    mounted: [],
  },
  {
    id: "chat-send-bridge",
    owner: "_apply-26721-all-features.js",
    bundle: "app-initial",
    critical: true,
    description: "Chat-mode send interception",
    present: [["await CDRStickyChatSend(", "send hook invokes the bridge"]],
    resolves: ["CDRStickyChatSend"],
    mounted: [],
  },
  {
    id: "handoff-codex-to-chat",
    owner: "_apply-handoff-sync-v1.js",
    bundle: "app-initial",
    critical: true,
    description: "Codex transcript reaches Chat on every send, not just the first",
    present: [
      ["__cdrHandoffV1", "handoff runtime"],
      ["pendingForChat(key)", "delta lookup on the chat send path"],
      ["commitChat(key,_cdrPend.mark)", "watermark advances after a successful send"],
    ],
    // The create-only gate is what made later Codex work invisible to Chat.
    absent: [["if(!continuing&&priorContext)", "create-only context gate"]],
    resolves: ["CDRInstallHandoffV1"],
    mounted: [],
  },
  {
    id: "handoff-chat-to-codex",
    owner: "_apply-handoff-sync-v1.js",
    bundle: "app-initial",
    critical: true,
    description: "Chat transcript reaches Codex on the interactive send path",
    present: [
      ["pendingForCodex(_k)", "delta lookup on the codex send path"],
      ["_h.commitCodex(_k,_p.mark)", "watermark advances after injection"],
    ],
    resolves: [],
    mounted: [],
  },
  {
    id: "handoff-publisher-feed",
    owner: "_apply-handoff-sync-v1.js",
    bundle: "local-conversation-thread",
    critical: true,
    description: "Transcript publisher feeds the persisted handoff store",
    present: [["recordCodex(key,lines)", "publisher writes into the handoff store"]],
    resolves: [],
    mounted: [],
  },
  {
    id: "turn-usage",
    owner: "_apply-turn-usage-v2.js",
    bundle: "app-initial",
    critical: true,
    description: "Per-turn usage bound to the turn that actually produced it",
    present: [
      ["__cdrTurnUsageV1", "turn-usage reconciler"],
      ["__cdrTurnUsageV1.get(turnId)", "badge reads its own turn's record"],
    ],
    // The fabricated implementation read a thread-level counter on a timer and
    // stamped it onto whichever turn mounted first. Both traces must be gone.
    absent: [
      ["CDRTaskUsageBadge", "cumulative task badge duplicated on every turn"],
      ["setTimeout(capture,300)", "timer-based fake per-turn capture"],
      ["Tokens for this turn only — not affected by parallel tasks", "false tooltip"],
    ],
    resolves: ["CDRInstallTurnUsageV1"],
    mounted: ["CDRTurnUsageBadge"],
  },
  {
    id: "task-limits",
    owner: "patch-usage-controls.js",
    bundle: "app-initial",
    critical: true,
    description: "Configurable task caps surfaced in the status panel",
    present: [
      ["Task limits:", "task limits row"],
      ["id:`limits`", "limits configuration entry"],
      ["Task tokens:", "cumulative token row"],
    ],
    resolves: [],
    mounted: [],
  },
];

// ─── Bundle location ────────────────────────────────────────────────

function assetsDir(platform) {
  return path.join(ROOT, "src", platform, "_asar", "webview", "assets");
}

function findBundle(platform, prefix) {
  const dir = assetsDir(platform);
  if (!fs.existsSync(dir)) throw new Error(`missing assets dir: ${dir}`);
  const name = fs
    .readdirSync(dir)
    .find((f) => f.startsWith(prefix + "-") && f.endsWith(".js"));
  if (!name) throw new Error(`no bundle matching "${prefix}-*.js" in ${dir}`);
  return path.join(dir, name);
}

// ─── Scope analysis ─────────────────────────────────────────────────

function childNodes(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === "string") out.push(c);
    } else if (v && typeof v.type === "string") {
      out.push(v);
    }
  }
  return out;
}

/**
 * Top-level bindings of the bundle. Only Program.body is scanned, which is
 * where esbuild puts every module-scope declaration in this monolith, so we
 * avoid walking ~10M nodes just to build the resolution set.
 */
function topLevelBindings(ast) {
  const names = new Set();
  const addPattern = (pat) => {
    if (!pat) return;
    switch (pat.type) {
      case "Identifier":
        names.add(pat.name);
        break;
      case "ObjectPattern":
        for (const p of pat.properties)
          addPattern(p.type === "RestElement" ? p.argument : p.value);
        break;
      case "ArrayPattern":
        for (const el of pat.elements) addPattern(el);
        break;
      case "AssignmentPattern":
        addPattern(pat.left);
        break;
      case "RestElement":
        addPattern(pat.argument);
        break;
    }
  };
  for (const node of ast.body) {
    if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) addPattern(d.id);
    } else if (
      node.type === "FunctionDeclaration" ||
      node.type === "ClassDeclaration"
    ) {
      if (node.id) names.add(node.id.name);
    } else if (node.type === "ImportDeclaration") {
      for (const s of node.specifiers) names.add(s.local.name);
    }
  }
  return names;
}

function findTopLevelFunction(ast, name) {
  for (const node of ast.body) {
    if (node.type === "FunctionDeclaration" && node.id?.name === name) return node;
    if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) {
        if (d.id?.type === "Identifier" && d.id.name === name && d.init) {
          if (/Function/.test(d.init.type)) return d.init;
        }
      }
    }
  }
  return null;
}

/**
 * Free identifiers referenced by a function subtree: every identifier used
 * in value position that is not bound by a parameter or declaration inside
 * the function itself.
 */
function freeIdentifiers(fnNode) {
  const free = new Set();

  const collectPattern = (pat, into) => {
    if (!pat) return;
    switch (pat.type) {
      case "Identifier":
        into.add(pat.name);
        break;
      case "ObjectPattern":
        for (const p of pat.properties)
          collectPattern(p.type === "RestElement" ? p.argument : p.value, into);
        break;
      case "ArrayPattern":
        for (const el of pat.elements) collectPattern(el, into);
        break;
      case "AssignmentPattern":
        collectPattern(pat.left, into);
        break;
      case "RestElement":
        collectPattern(pat.argument, into);
        break;
    }
  };

  // Hoist every declaration inside `node` that belongs to the scope owned
  // by `node` (does not descend into nested functions for var/function).
  const scopeDeclarations = (node) => {
    const bound = new Set();
    if (/Function/.test(node.type)) {
      for (const p of node.params) collectPattern(p, bound);
      if (node.id) bound.add(node.id.name);
    }
    const visit = (n, isRoot) => {
      if (!isRoot && /Function/.test(n.type)) {
        if (n.type === "FunctionDeclaration" && n.id) bound.add(n.id.name);
        return;
      }
      if (n.type === "VariableDeclaration") {
        for (const d of n.declarations) collectPattern(d.id, bound);
      }
      if (n.type === "ClassDeclaration" && n.id) bound.add(n.id.name);
      if (n.type === "CatchClause" && n.param) collectPattern(n.param, bound);
      for (const c of childNodes(n)) visit(c, false);
    };
    visit(node, true);
    return bound;
  };

  const walk = (node, scopes) => {
    let nextScopes = scopes;
    if (/Function/.test(node.type)) {
      nextScopes = scopes.concat([scopeDeclarations(node)]);
    }

    if (node.type === "Identifier") {
      const name = node.name;
      if (!nextScopes.some((s) => s.has(name))) free.add(name);
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      const v = node[key];

      // Skip non-value identifier positions.
      if (node.type === "MemberExpression" && key === "property" && !node.computed)
        continue;
      if (node.type === "Property" && key === "key" && !node.computed) continue;
      if (node.type === "MethodDefinition" && key === "key" && !node.computed)
        continue;
      if (node.type === "PropertyDefinition" && key === "key" && !node.computed)
        continue;
      if ((node.type === "BreakStatement" || node.type === "ContinueStatement") && key === "label")
        continue;
      if (node.type === "LabeledStatement" && key === "label") continue;

      if (Array.isArray(v)) {
        for (const c of v) if (c && typeof c.type === "string") walk(c, nextScopes);
      } else if (v && typeof v.type === "string") {
        walk(v, nextScopes);
      }
    }
  };

  walk(fnNode, [scopeDeclarations(fnNode)]);
  return free;
}

/** Count references to `name` outside its own declaration. */
function referenceCount(source, name) {
  const re = new RegExp(`\\b${name}\\b`, "g");
  return (source.match(re) || []).length;
}

// ─── Runner ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const platform =
    args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a)) || "mac-x64";

  const bundlePaths = new Map();
  const sources = new Map();
  const asts = new Map();
  const topLevel = new Map();

  const need = new Set(FEATURES.map((f) => f.bundle));
  for (const prefix of need) {
    const p = findBundle(platform, prefix);
    bundlePaths.set(prefix, p);
    const src = fs.readFileSync(p, "utf8");
    sources.set(prefix, src);
    if (!asJson) {
      console.log(
        `[parse] ${path.basename(p)} (${(src.length / 1e6).toFixed(1)} MB)`,
      );
    }
    const t0 = Date.now();
    const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
    asts.set(prefix, ast);
    topLevel.set(prefix, topLevelBindings(ast));
    if (!asJson) {
      console.log(
        `[parse] done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ` +
          `${topLevel.get(prefix).size} top-level bindings`,
      );
    }
  }

  const results = [];
  let hardFail = false;

  for (const feature of FEATURES) {
    const src = sources.get(feature.bundle);
    const ast = asts.get(feature.bundle);
    const bindings = topLevel.get(feature.bundle);
    const problems = [];

    for (const [needle, why] of feature.present || []) {
      const needles = Array.isArray(needle) ? needle : [needle];
      if (!needles.some((n) => src.includes(n))) {
        problems.push(`missing ${why} — ${needles.map((n) => `"${n}"`).join(" | ")}`);
      }
    }

    for (const [needle, why] of feature.absent || []) {
      if (src.includes(needle))
        problems.push(`replacement never happened, ${why} still present — "${needle}"`);
    }

    for (const name of feature.mounted || []) {
      const n = referenceCount(src, name);
      if (n === 0) problems.push(`${name} is not present at all`);
      else if (n < 2) problems.push(`${name} is declared but never rendered`);
    }

    for (const name of feature.resolves || []) {
      const fn = findTopLevelFunction(ast, name);
      if (!fn) {
        problems.push(`${name} is not a resolvable top-level function`);
        continue;
      }
      const unresolved = [...freeIdentifiers(fn)].filter(
        (id) => !KNOWN_GLOBALS.has(id) && !bindings.has(id),
      );
      if (unresolved.length) {
        problems.push(
          `${name} references identifiers that do not exist in this bundle: ` +
            unresolved.join(", "),
        );
      }
    }

    const ok = problems.length === 0;
    if (!ok && feature.critical) hardFail = true;
    results.push({ ...feature, ok, problems });

    if (!asJson) {
      const tag = ok ? "PASS" : feature.critical ? "FAIL" : "WARN";
      console.log(`\n[${tag}] ${feature.id} — ${feature.description}`);
      console.log(`       owner: ${feature.owner}`);
      for (const p of problems) console.log(`       - ${p}`);
    }
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        { platform, hardFail, results: results.map(({ id, ok, critical, owner, problems }) => ({ id, ok, critical, owner, problems })) },
        null,
        2,
      ),
    );
  } else {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n== ${passed}/${results.length} features verified ==`);
    if (hardFail) {
      console.error(
        "\n[x] Critical features are missing or broken in the patched bundle.\n" +
          "[x] This build must NOT be released. Fix the owning patch script above.",
      );
    }
  }

  process.exit(hardFail ? 1 : 0);
}

main();
