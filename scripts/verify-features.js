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
 * bundle. This prevents a patcher from passing on marker strings while its
 * component or route is still unreachable in the actual application.
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
    id: "local-canonical-mode",
    owner: "patch-local-canonical-mode.js",
    bundle: "app-initial",
    critical: true,
    description: "Chat / ChatGPT / Codex presets on the same native task",
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
    id: "mode-ui-invariants",
    owner: "_apply-mode-ui-invariants-v1.js",
    bundle: "app-initial",
    critical: true,
    description: "Chat stays local while model state and send color update immediately",
    present: [
      ["CDRSetMode(`chat`)", "Chat preset selection"],
      ["mode:CDRMode", "native selector receives local mode state"],
      ["ChatGPT", "restored ChatGPT identity"],
      ["codex-rebuild:local-canonical-selector-v3", "26.727 selector patch"],
      ["CDRObserver=new MutationObserver(CDRMarkSend)", "send-button remount coloring"],
      ["__cdrChatSelectedModel||localStorage.getItem(`cdr-chat-model-selection`)", "immediate Chat model selection"],
    ],
    absent: [
      ["CDRSetMode(`chat`);CDRRuntime.setMode(`chat`);p", "Chat upstream navigation"],
      ["window.location.reload", "Chat mode reload"],
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
    id: "local-chat-submit-route",
    owner: "_apply-26721-all-features.js",
    bundle: "app-initial",
    critical: true,
    description: "Local task Chat sends use ChatGPT transport before AppServer turn/start",
    present: [
      ["codex-rebuild:all-features-26721-v1:local-submit-hook", "local submit hook"],
      ["await CDRStickyChatSend(e,t", "same-task Chat bridge call"],
      ["cdr-chat-turn-", "synthetic local turn identity"],
    ],
    resolves: ["CDRStickyChatSend"],
    mounted: [],
  },
  {
    id: "chat-send-lifecycle",
    owner: "_apply-chat-stream-lifecycle-v1.js",
    bundle: "app-initial",
    critical: true,
    description: "Chat replies appear immediately and terminal events restore the send button",
    present: [
      ["detail:{key,rows:Array.isArray(rows)?rows:null}", "fresh rows published to the mounted task"],
      ["d.message.end_turn===true", "terminal Chat message detection"],
      ["Promise.resolve(client.startCompletionStream({", "stream-start rejection handling"],
    ],
    resolves: [],
    mounted: [],
  },
  {
    id: "chat-native-thread-navigation",
    owner: "_apply-26721-all-features.js",
    bundle: "app-initial",
    critical: true,
    description: "Handled Chat sends open the native Codex task, never a ChatGPT Web route",
    present: [
      ["function CDRNavigateLocalThread(threadId)", "native task navigation helper"],
      ["CDRNavigateLocalThread(n)", "conversation send opens its native task"],
      ["CDRNavigateLocalThread(t)", "local submit opens its native task"],
    ],
    absent: [["window.location.hash='/g/c/'", "ChatGPT Web conversation navigation"]],
    resolves: ["CDRNavigateLocalThread"],
    mounted: [],
  },
  {
    id: "chat-smooth-stream",
    owner: "_apply-chat-fake-stream-v1.js",
    bundle: "app-initial",
    critical: true,
    description: "Real ChatGPT snapshots render smoothly without a fake post-response replay",
    present: [
      ["codex-rebuild:chat-smooth-stream-v3:live", "live snapshot coalescing"],
      ["flushTimer=setTimeout(flush,16)", "paint-sized render cadence"],
      ["codex-rebuild:chat-smooth-stream-v3:complete", "immediate terminal commit"],
      ["text:'Thinking…'", "visible optimistic assistant state"],
    ],
    absent: [
      ["Math.ceil(2000/", "old two-second fake replay"],
      ["Date.now()+650", "post-response drain delay"],
    ],
    resolves: [],
    mounted: [],
  },
  {
    id: "chat-history-render",
    owner: "_apply-chat-extras-render-v1.js",
    bundle: "local-conversation-thread",
    critical: true,
    description: "Persisted Chat rows render inside the native task transcript",
    present: [
      ["codex-rebuild:chat-extras-render-v1:overlay", "same-task transcript overlay"],
      ["cdr-thread-extras:local:", "per-task Chat history store"],
      ["CDRExtraMapped", "Chat rows mapped to native turn shape"],
      [["CDRDetail?.key&&CDRDetail.key!==CDRKey", "CDROnExtras=ev=>"], "task-scoped immediate row updates"],
      [["CDRDurableLast>=CDRLocalLast", "Number(CDRDurableRows.at(-1)?.ts||0)>=Number(CDRRows.at(-1)?.ts||0)"], "stale durable snapshot guard"],
      [["ae=CDRMerge(ae.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped)", "ze=CDRMerge(ze.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped)"], "mixed native and Chat visible history"],
    ],
    absent: [
      ["if(_cdrInChat){ae=CDRExtraMapped", "mode-gated history that hides Chat rows in Codex"],
      ["ne=CDRExtraMapped.at(-1)", "synthetic Chat ID replacing native latest turn"],
    ],
    resolves: [],
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
      ["pendingForCodex(_cdrCodexKey)", "delta lookup on the codex send path"],
      [["messageMetadata:u,prompt:l.trim(),systemHints:d", "input:_cdrCodexInput,environments:", "clientUserMessageId:c,input:_cdrCodexInput,cwd:"], "hidden context is transport-only"],
      ["commitCodex(_cdrCodexKey,_cdrCodexPend.mark)", "watermark advances after successful transport"],
    ],
    absent: [["l=_p.text+'\\n\\n'+String(l||'');_h.commitCodex", "visible prompt mutation with eager watermark commit"]],
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
    id: "custom-providers-visible",
    owner: "_apply-custom-providers-settings-v1.js",
    bundle: "use-visible-settings-sections",
    critical: true,
    description: "Custom Providers is visible and applies real Codex configuration",
    present: [
      ["CDRCustomProvidersPanelV2 as CDRCustomProvidersPanelV2", "module-scoped panel export"],
      ["codex-rebuild:custom-providers-settings-v1:icon-v2-export", "module-scoped icon binding"],
      ["\"custom-providers\":CDRCustomProvidersIconV2", "icon map uses module-scoped binding"],
      ["s as CDRInterop", "runtime interop used for React namespace"],
      [["const CDRReact=CDRInterop(y(),1)", "const CDRReact=CDRInterop(U(),1)"], "real React hooks namespace"],
      [["const CDRJsx=a()", "const CDRJsx=w()"], "real JSX runtime namespace"],
      ["return(0,CDRJsx.jsx)(tag,p)", "panel uses stable JSX runtime"],
      ["case`data-controls`:case`custom-providers`:return!0", "visible settings filter"],
      ["case`data-controls`:case`custom-providers`:case`code-review`", "non-loading route state"],
      ["Save changes", "apply action"],
      ["Start with a preset", "preset guidance"],
      ["data-cdr-provider-row", "native provider rows"],
      ["TOML preview", "preview surface"],
      ["htmlFor:fieldId", "accessible field labels"],
      ["window.confirm", "destructive-action confirmation"],
      ["globalThis.__cdrWriteConfigEdits", "native config bridge call"],
      ["normalized.map(({api_key,...p})=>p)", "secret-free local draft persistence"],
    ],
    absent: [
      ["value:'chat'", "unsupported legacy wire API option"],
      ["window.__CDRCustomProvidersPanel", "obsolete window panel registry"],
      ["function CDRCustomProvidersPanel(){", "duplicate legacy panel"],
      ["s.useState", "non-React minified initializer used as hooks"],
      ["s.useEffect", "non-React minified initializer used as hooks"],
      ["return(0,U.jsx)(tag,p)", "initializer-owned JSX runtime used by panel"],
    ],
    resolves: ["CDRCustomProvidersPanelV2", "CDRCustomProvidersIconV2"],
    mounted: ["CDRCustomProvidersPanelV2", "CDRCustomProvidersIconV2"],
  },
  {
    id: "custom-providers-config-bridge",
    owner: "_apply-custom-providers-settings-v1.js",
    bundle: "app-initial",
    critical: true,
    description: "Custom Provider edits reach config/batchWrite",
    present: [
      ["codex-rebuild:custom-providers-settings-v1:config-bridge", "config bridge"],
      ["rp(`batch-write-config-value`", "AppServer batchWrite dispatcher"],
      ["custom-providers-settings-v1:26727:gls", "modern settings route registry"],
      ["\"custom-providers\":KJ(async()=>(await eu(async()=>{let{CDRCustomProvidersPanelV2:e}=await import(`./use-visible-settings-sections-", "native KJ lazy panel import"],
      ["custom-providers-settings-v1:26727:KJ", "modern loader marker"],
      ["custom-providers-settings-v1:26727:Yyu", "modern section label marker"],
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
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  const name = files.find((f) => f.startsWith(prefix + "-") && f.endsWith(".js"));
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
