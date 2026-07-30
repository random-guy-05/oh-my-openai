#!/usr/bin/env node
"use strict";

/**
 * Fast post-sync audit.  Run this before and after reapplying custom patches;
 * it reports upstream provenance, detects anchor drift, and rejects stale
 * chained catalog patches that make a future rebase non-deterministic.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const platform = process.argv.find((arg) => /^mac-/.test(arg)) || "mac-x64";
const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
const phase = phaseArg ? phaseArg.slice("--phase=".length) : process.argv.includes("--clean") ? "clean" : "patched";
const jsonOutput = process.argv.includes("--json");
if (!["clean", "patched"].includes(phase)) throw new Error(`invalid audit phase: ${phase}`);
const assets = path.join(ROOT, "src", platform, "_asar", "webview", "assets");
if (!fs.existsSync(assets)) throw new Error(`missing assets directory: ${assets}`);
const files = fs.readdirSync(assets);
const monoName = files.find((file) => file.startsWith("app-initial-") && file.endsWith(".js"));
const localName = files.find((file) => file.includes("local-conversation-thread") && file.endsWith(".js"));
if (!monoName || !localName) throw new Error("required canonical bundles are missing");
const monoPath = path.join(assets, monoName);
const localPath = path.join(assets, localName);
const mono = fs.readFileSync(monoPath, "utf8");
const local = fs.readFileSync(localPath, "utf8");
const homeName = files.find((file) => file.startsWith("home-composer-mode-toggle-") && file.endsWith(".js"));
const contextName = files.find((file) => file.startsWith("use-chatgpt-composer-controller-") && file.endsWith(".js"));
const cssName = files.find((file) => file.startsWith("app-") && file.endsWith(".css"));
const home = homeName ? fs.readFileSync(path.join(assets, homeName), "utf8") : "";
const context = contextName ? fs.readFileSync(path.join(assets, contextName), "utf8") : "";
const css = cssName ? fs.readFileSync(path.join(assets, cssName), "utf8") : "";
const upstreamPath = path.join(ROOT, "src", platform, ".upstream-source.json");
const upstream = JSON.parse(fs.readFileSync(upstreamPath, "utf8"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

const patchedChecks = [
  [mono, "codex-rebuild:local-canonical-selector-v3", "canonical mode selector"],
  [mono, "codex-rebuild:all-features-26721-v1:local-submit-hook", "local Chat submit route"],
  [mono, "CDRStickyChatSend", "Chat bridge"],
  [mono, "client.startCompletionStream({", "ChatGPT stream transport"],
  [mono, "d.message.end_turn===true", "Chat terminal lifecycle"],
  [mono, "detail:{key,rows:Array.isArray(rows)?rows:null}", "immediate Chat row publication"],
  [mono, "CDRMergeChatModels", "live ChatGPT catalog"],
  [mono, "/(?:^|[-_])codex(?:$|[-_])/", "explicit Codex model filter"],
  [local, "codex-rebuild:chat-extras-render-v1:overlay", "same-task history overlay"],
  [local, "CDRExtraMapped", "Chat rows mapped to native turns"],
  [local, "__cdrChatHistoryRenderCache", "history render cache"],
  [local, "CDRDurableLast>=CDRLocalLast", "stale Chat history guard"],
  [mono, "codex-rebuild:mode-ui-invariants-v1:mode-nav", "mode navigation handler"],
  [mono, "children:n?`ChatGPT Work`:`ChatGPT Work`", "ChatGPT Work label"],
  [mono, "modelControllers.add(controller);\n    return () => modelControllers.delete(controller);", "render-safe model controller registration"],
  [mono, "CDRObserver=new MutationObserver(CDRMarkSend)", "send-button remount coloring"],
  [home, "cdr-home-mode-toggle", "Home mode toggle hook"],
  [css, 'data-codex-product-mode="chat"] .cdr-home-mode-toggle{display:none', "Chat-only Home composer"],
  [context, "codex-rebuild:luna-light-context-v2:model", "Luna Light context handoff"],
];
const cleanChecks = [
  [mono, "markRequestDispatched", "local submit lifecycle"],
  [mono, "sendRequest(`turn/start`", "native turn/start transport"],
  [mono, "getModelsResponse", "native model catalog response"],
  [local, "renderEntries:", "native transcript render entries"],
  [local, "visibleTurnEntries:", "native transcript visible entries"],
];
const checks = phase === "clean" ? cleanChecks : patchedChecks;
const failures = [];
for (const [source, needle, label] of checks) {
  if (!source.includes(needle)) failures.push(`${label}: missing ${needle}`);
}
if (phase === "clean") {
  const customMarkers = ["codex-rebuild:local-canonical", "codex-rebuild:all-features-26721", "codex-rebuild:chat-extras-render"];
  for (const marker of customMarkers) {
    if (mono.includes(marker) || local.includes(marker)) failures.push(`clean source already contains custom marker: ${marker}`);
  }
} else {
  for (const stale of ["chat-catalog-v3", "chat-catalog-v3b", "chat-catalog-v3c", "chat-catalog-v4", "chat-catalog-v5"]) {
    if (mono.includes(stale)) failures.push(`stale chained patch marker remains: ${stale}`);
  }
  if (mono.includes("P_a(await this.request.getModelsResponse())")) failures.push("native catalog call was not replaced");
  if (mono.includes("if(CDRM!==`chat`)p(CDRM)")) failures.push("old local-only mode handler still present");
  if (!mono.includes("if(CDRM===`work`||CDRM===`codex`)p(CDRM)")) failures.push("Work/Codex native navigation is missing");
  if (mono.includes("CDRM===`chat`){try{p(CDRM)") || mono.includes("CDRM===`chat`){try{window.location.reload()")) failures.push("Chat mode navigates or reloads instead of staying in the native task");
  if (mono.includes("const current = mode();") || mono.includes("let current=mode()")) failures.push("model controller registration can recurse during React effect mount");
  if (local.includes("if(!CDRRenderHasGap)")) failures.push("virtualized transcript gap can hide Chat history");
}
try {
  acorn.parse(mono, { ecmaVersion: "latest", sourceType: "module" });
  acorn.parse(local, { ecmaVersion: "latest", sourceType: "module" });
} catch (error) {
  failures.push(`bundle parse failed: ${error.message}`);
}

const report = {
  phase,
  platform,
  upstream,
  bundles: { canonical: { name: monoName, sha256: hash(mono) }, thread: { name: localName, sha256: hash(local) } },
  checks: checks.map(([source, needle, label]) => ({ label, needle, ok: source.includes(needle) })),
  failures,
  ok: failures.length === 0,
};
if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${phase} audit: upstream ${upstream.version} build ${upstream.build} ${upstream.architecture}`);
  console.log(`upstream ASAR ${upstream.appAsarSha256}`);
  console.log(`canonical ${monoName} sha256 ${hash(mono)}`);
  console.log(`thread ${localName} sha256 ${hash(local)}`);
  for (const item of report.checks) console.log(`${item.ok ? "[ok]" : "[x]"} ${item.label}`);
}
if (failures.length) {
  if (!jsonOutput) {
    console.error(`\n${phase} rebase audit failed:`);
    failures.forEach((failure) => console.error(`- ${failure}`));
  }
  process.exitCode = 1;
} else if (!jsonOutput) {
  console.log(`${phase} rebase audit passed`);
}
