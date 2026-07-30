#!/usr/bin/env node
"use strict";

/** Release gates for features added after custom.5.
 *
 * These assertions intentionally test cross-patcher behavior in the compiled
 * bundles. Marker-only checks missed the regressions this cleanup repairs.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const files = fs.readdirSync(ASSETS);

function asset(predicate, label) {
  const name = files.find(predicate);
  assert.ok(name, `missing ${label} bundle`);
  return { name, source: fs.readFileSync(path.join(ASSETS, name), "utf8") };
}

function js(prefix, label = prefix) {
  return asset((name) => name.startsWith(prefix) && name.endsWith(".js"), label);
}

function parses(bundle) {
  acorn.parse(bundle.source, { ecmaVersion: "latest", sourceType: "module" });
}

const mono = js("app-initial-", "app-initial");
const thread = asset(
  (name) => name.includes("local-conversation-thread") && name.endsWith(".js"),
  "local-conversation-thread",
);
const sections = js("use-visible-settings-sections-", "visible settings sections");
const settings = js("settings-page-", "settings page");
const home = js("home-composer-mode-toggle-", "home mode toggle");
const css = asset((name) => name.startsWith("app-") && name.endsWith(".css"), "app CSS");

for (const bundle of [mono, thread, sections, settings, home]) parses(bundle);

// Mode identity and routing: Chat is a same-task local preset. Work and Codex
// may use their native surfaces, but Chat must never navigate or swap sidebars.
assert.ok(
  mono.source.includes(
    "if(CDRM===`work`||CDRM===`codex`)p(CDRM)",
  ),
  "mode handler does not keep Chat local while routing Work/Codex",
);
assert.ok(mono.source.includes("children:n?`ChatGPT`:`ChatGPT`"), "ChatGPT identity is missing");
assert.ok(!mono.source.includes("CDRM===`chat`){try{p(CDRM)"), "Chat mode calls upstream navigation");
assert.ok(!mono.source.includes("CDRM===`chat`){try{window.location.reload()"), "Chat mode reloads");
assert.ok(mono.source.includes("function CDRNavigateLocalThread(threadId)"), "native task redirect helper is missing");
assert.ok(mono.source.includes("CDRNavigateLocalThread(n)"), "handled Chat send does not open its native task");
assert.ok(mono.source.includes("CDRNavigateLocalThread(t)"), "local Chat submit does not open its native task");
for (const threadId of ["n", "t"]) {
  const navigate = mono.source.indexOf(`CDRNavigateLocalThread(${threadId})`);
  const send = mono.source.indexOf(`await CDRStickyChatSend(e,${threadId}`, navigate);
  assert.ok(navigate >= 0 && send > navigate, `Chat navigation for ${threadId} does not happen before transport`);
}
assert.ok(!mono.source.includes("window.location.hash='/g/c/'"), "Chat send navigates into ChatGPT Web");
assert.ok(!mono.source.includes("localStorage.setItem('cdr-thread-map'"), "ChatGPT IDs leak into Codex's thread map");
assert.ok(css.source.includes(':root[data-codex-product-mode="chat"] .cdr-home-mode-toggle{display:none!important}'), "Chat-only UI does not hide the home Work/Chat toggle");

// Immediate selector/button behavior.
assert.ok(mono.source.includes("CDRRuntime.registerModelController("), "mode changes cannot update the model selector");
assert.ok(mono.source.includes("CDRObserver=new MutationObserver(CDRMarkSend)"), "send-button color does not survive remounts");
assert.ok(mono.source.includes("__cdrChatSelectedModel||localStorage.getItem(`cdr-chat-model-selection`)"), "Chat model selection is not immediate/durable");

// Full mixed transcript remains visible in every mode, but synthetic Chat IDs
// never replace AppServer's authoritative latest visible turn ID.
assert.ok(thread.source.includes("ae=CDRMerge(ae.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped)"), "visible transcript does not merge native and Chat rows");
assert.ok(thread.source.includes("ie=CDRMerge(ie.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped)"), "render transcript does not merge native and Chat rows");
assert.ok(!thread.source.includes("if(_cdrInChat){ae=CDRExtraMapped"), "Codex mode hides Chat history");
assert.ok(!thread.source.includes("ne=CDRExtraMapped.at(-1)"), "synthetic Chat ID corrupts native latest-turn bookkeeping");

// Bidirectional context stays delta-synced after the first send.
assert.ok(mono.source.includes("pendingForChat(key)"), "Codex-to-Chat delta handoff is missing");
assert.ok(!mono.source.includes("if(!continuing&&globalThis.__cdrHandoffV1)"), "later Codex turns are blocked from an existing Chat conversation");
assert.ok(mono.source.includes("pendingForCodex(_cdrCodexKey)"), "Chat-to-Codex delta handoff is missing");
assert.ok(mono.source.includes("messageMetadata:u,prompt:l.trim(),systemHints:d"), "Chat-to-Codex context is not transport-only");
assert.ok(mono.source.includes("commitCodex(_cdrCodexKey,_cdrCodexPend.mark)"), "Chat-to-Codex watermark does not wait for transport success");

// Live stream smoothing: real snapshots remain visible while they arrive; no
// two-second post-response replay and no forced always-Send composer state.
assert.ok(mono.source.includes("codex-rebuild:chat-smooth-stream-v3:live"), "live Chat stream updates are missing");
assert.ok(mono.source.includes("codex-rebuild:chat-smooth-stream-v3:complete"), "immediate completion is missing");
assert.ok(mono.source.includes("flushTimer=setTimeout(flush,16)"), "live update cadence is missing");
assert.ok(mono.source.includes("text:'Thinking…'"), "visible Chat thinking state is missing");
assert.ok(!mono.source.includes("Math.ceil(2000/"), "old fake post-response replay remains");
assert.ok(!mono.source.includes("Date.now()+650"), "post-response drain delay remains");
assert.ok(!mono.source.includes("globalThis.__cdrLocalModeV4?.mode?.()!=='chat'"), "Chat composer is forced to Send while a response is active");
assert.ok(mono.source.includes("codex-rebuild:chat-stream-clear-v1"), "terminal Chat sends do not clear stream state");

// Custom providers must be visible and must configure Codex, not merely cache
// a pretend API key in localStorage or offer the unsupported legacy wire API.
assert.ok(sections.source.includes('`custom-providers`'), "Custom Providers is absent from visible settings");
assert.ok(sections.source.includes("CDRCustomProvidersPanelV2 as CDRCustomProvidersPanelV2"), "Custom Providers module-scoped panel is not exported");
assert.ok(!sections.source.includes("window.__CDRCustomProvidersPanel"), "obsolete Custom Providers window registry remains");
assert.ok(!sections.source.includes("function CDRCustomProvidersPanel(){"), "duplicate legacy Custom Providers panel remains");
assert.ok(sections.source.includes("case`data-controls`:case`custom-providers`:return!0"), "Custom Providers is filtered from visible settings");
assert.ok(sections.source.includes("case`data-controls`:case`custom-providers`:case`code-review`"), "Custom Providers route remains in loading state");
assert.ok(sections.source.includes("Save to Codex"), "Custom Providers has no apply action");
assert.ok(sections.source.includes("globalThis.__cdrWriteConfigEdits"), "Custom Providers does not use the config bridge");
assert.ok(sections.source.includes("experimental_bearer_token"), "direct-token configuration is not wired");
assert.ok(sections.source.includes("next.map(({api_key,...p})=>p)"), "provider secrets are cached in localStorage");
assert.ok(!sections.source.includes("value:'chat'"), "unsupported legacy Chat Completions wire API is offered");
assert.ok(mono.source.includes("codex-rebuild:custom-providers-settings-v1:config-bridge"), "AppServer config bridge is missing");
assert.ok(mono.source.includes("Rf(`batch-write-config-value`"), "provider edits do not reach config/batchWrite");
assert.ok(mono.source.includes('{slug:`data-controls`},{slug:`custom-providers`}'), "Custom Providers route is not registered");
assert.ok(mono.source.includes('"custom-providers":JY(async()=>{let module=await import(`./use-visible-settings-sections-'), "Custom Providers lazy loader is not a real module import");
assert.ok(mono.source.includes("module.CDRCustomProvidersPanelV2"), "Custom Providers lazy loader does not read the direct module export");
assert.ok(settings.source.includes("`skills-settings`,`custom-providers`,`browser-use`"), "Custom Providers is not in the Integrations navigation group");
assert.ok(settings.source.includes("data-controls.custom-providers"), "Custom Providers settings label is missing");

console.log("new feature integrations: all compiled invariants passed");
