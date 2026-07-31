#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const asar = require("@electron/asar");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const archive =
  process.argv[2] ||
  path.join(ROOT, "out", "mac-x64", "Codex.app", "Contents", "Resources", "app.asar");

assert.ok(fs.existsSync(archive), `missing packaged ASAR: ${archive}`);
const entries = asar.listPackage(archive).map((entry) => entry.replace(/^\//, ""));
const mainName = entries.find((entry) =>
  /^webview\/assets\/app-initial-.*\.js$/.test(entry),
);
const threadName = entries.find((entry) =>
  /^webview\/assets\/local-conversation-thread-.*\.js$/.test(entry),
);
const visibleSettingsName = entries.find((entry) =>
  /^webview\/assets\/use-visible-settings-sections-.*\.js$/.test(entry),
);
const settingsPageName = entries.find((entry) =>
  /^webview\/assets\/settings-page-.*\.js$/.test(entry),
);
assert.ok(mainName, "packaged renderer bundle is missing");
assert.ok(threadName, "packaged local-thread bundle is missing");
assert.ok(visibleSettingsName, "packaged visible-settings bundle is missing");
assert.ok(settingsPageName, "packaged settings-page bundle is missing");

const main = asar.extractFile(archive, mainName).toString("utf8");
const thread = asar.extractFile(archive, threadName).toString("utf8");
const visibleSettings = asar.extractFile(archive, visibleSettingsName).toString("utf8");
const settingsPage = asar.extractFile(archive, settingsPageName).toString("utf8");
acorn.parse(main, { ecmaVersion: "latest", sourceType: "module" });
acorn.parse(thread, { ecmaVersion: "latest", sourceType: "module" });
acorn.parse(visibleSettings, { ecmaVersion: "latest", sourceType: "module" });
acorn.parse(settingsPage, { ecmaVersion: "latest", sourceType: "module" });

for (const [needle, label] of [
  ["codex-rebuild:local-canonical-selector-v3", "same-task mode selector"],
  ["client.startCompletionStream({", "ChatGPT Web stream transport"],
  ["CDRMergeChatModels", "signed-in ChatGPT model catalog"],
  ["codex-rebuild:local-canonical-selector-v3", "same-task mode selector"],
  ["mode:CDRMode", "native mode state"],
  ["CDRSetMode(`chat`)", "Chat preset selection"],
  ["CDRObserver=new MutationObserver(CDRMarkSend)", "send-button color remount support"],
  ["modelControllers.add(controller);\n    return () => modelControllers.delete(controller);", "render-safe model registration"],
  ["detail:{key,rows:Array.isArray(rows)?rows:null}", "immediate Chat row publication"],
  ["codex-rebuild:chat-navigate-before-send-v1", "immediate native-task navigation"],
  ["codex-rebuild:chat-smooth-stream-v3:live", "live Chat stream updates"],
  ["codex-rebuild:chat-smooth-stream-v3:complete", "immediate Chat completion"],
  ["codex-rebuild:custom-providers-settings-v1:config-bridge", "Custom Providers config bridge"],
  ["defaultMessage:`Custom Providers`", "Custom Providers visible label"],
  ["settings.nav.custom-providers", "Custom Providers navigation message descriptor"],
  ["d.message.end_turn===true", "Chat terminal lifecycle"],
]) {
  assert.ok(main.includes(needle), `packaged runtime missing ${label}`);
}

for (const [needle, label] of [
  [["CDRDetail?.key&&CDRDetail.key!==CDRKey", "CDROnExtras=ev=>"], "task-scoped Chat updates"],
  [["CDRDurableLast>=CDRLocalLast", "Number(CDRDurableRows.at(-1)?.ts||0)>=Number(CDRRows.at(-1)?.ts||0)"], "stale Chat history guard"],
]) {
  assert.ok((Array.isArray(needle) ? needle.some((candidate) => thread.includes(candidate)) : thread.includes(needle)), `packaged runtime missing ${label}`);
}

for (const [needle, label] of [
  ["data-cdr-custom-providers", "Custom Providers panel"],
  ["Save changes", "Custom Providers save action"],
  ["Start with a preset", "Custom Providers preset guidance"],
  ["data-cdr-provider-row", "Custom Providers native provider rows"],
  ["TOML preview", "Custom Providers preview surface"],
  ["htmlFor:fieldId", "Custom Providers accessible field labels"],
  ["window.confirm", "Custom Providers destructive-action confirmation"],
  ["wire_api:'responses'", "Responses-only provider config"],
  ["normalized.map(({api_key,...p})=>p)", "secret-free provider local storage"],
  ["globalThis.__cdrWriteConfigEdits", "native provider config writer"],
  ["CDRCustomProvidersPanelV2 as CDRCustomProvidersPanelV2", "Custom Providers module-scoped export"],
  ["codex-rebuild:custom-providers-settings-v1:icon-v2-export", "Custom Providers module-scoped icon"],
  ['"custom-providers":CDRCustomProvidersIconV2', "Custom Providers module-scoped icon map"],
  ["o as CDRInterop", "Custom Providers React runtime interop"],
  [["const CDRReact=CDRInterop(y(),1)", "const CDRReact=CDRInterop(U(),1)"], "Custom Providers React hooks namespace"],
  [["const CDRJsx=a()", "const CDRJsx=w()"], "Custom Providers JSX runtime namespace"],
  ["return(0,CDRJsx.jsx)(tag,p)", "Custom Providers stable JSX render path"],
  ["case`data-controls`:case`custom-providers`:return!0", "Custom Providers visibility filter"],
]) {
  assert.ok((Array.isArray(needle) ? needle.some((candidate) => visibleSettings.includes(candidate)) : visibleSettings.includes(needle)), `packaged runtime missing ${label}`);
}
assert.ok(!visibleSettings.includes("s.useState"), "packaged runtime uses a non-React initializer for Custom Providers hooks");
assert.ok(!visibleSettings.includes("s.useEffect"), "packaged runtime uses a non-React initializer for Custom Providers effects");
assert.ok(!visibleSettings.includes("t as CDRInterop"), "packaged runtime uses the CommonJS factory instead of namespace interop");
assert.ok(!visibleSettings.includes("return(0,U.jsx)(tag,p)"), "packaged runtime uses an initializer-owned JSX binding for Custom Providers");
assert.ok(!visibleSettings.includes("window.__CDRCustomProvidersPanel"), "packaged runtime retains the obsolete Custom Providers window registry");
assert.ok(!visibleSettings.includes("function CDRCustomProvidersPanel(){"), "packaged runtime retains the duplicate legacy Custom Providers panel");
assert.ok(!visibleSettings.includes("function CDRCustomProvidersIcon(e){"), "packaged runtime retains the unbound legacy Custom Providers icon");

assert.ok(
  settingsPage.includes("data-controls.custom-providers"),
  "packaged runtime missing Custom Providers settings slug",
);
assert.ok(settingsPage.includes("`skills-settings`,`custom-providers`,`browser-use`"), "Custom Providers is not in a visible navigation group");
assert.ok(main.includes("custom-providers-settings-v1:26727:gls"), "Custom Providers gls route is not registered");
assert.ok(main.includes('"custom-providers":KJ(async()=>(await eu(async()=>{let{CDRCustomProvidersPanelV2:e}=await import(`./use-visible-settings-sections-'), "Custom Providers panel does not use a native KJ module import");
assert.ok(main.includes("custom-providers-settings-v1:26727:KJ"), "Custom Providers KJ loader marker is missing");
assert.ok(main.includes("custom-providers-settings-v1:26727:Yyu"), "Custom Providers Yyu label marker is missing");
assert.ok(main.includes("settings.nav.custom-providers"), "Custom Providers navigation message descriptor is missing");
assert.ok(main.includes("rp(`batch-write-config-value`"), "Custom Providers bridge does not use the AppServer request helper");

for (const removed of ["codex-rebuild:usage-controls-v1", "CDRTaskUsageBadge", "CDRTurnUsageBadge", "cdr-turn-usage-v1"]) {
  assert.ok(!main.includes(removed) && !thread.includes(removed), `packaged runtime still contains removed usage control: ${removed}`);
}

assert.ok(!main.includes("const current = mode();"), "packaged runtime contains recursive formatted model registration");
assert.ok(!main.includes("let current=mode()"), "packaged runtime contains recursive minified model registration");

const digest = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
console.log(`[ok] packaged runtime parse, custom markers, and React recursion guard passed (${digest})`);
