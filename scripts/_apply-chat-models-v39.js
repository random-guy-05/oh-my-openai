#!/usr/bin/env node
"use strict";
/**
 * v39: Replace broken ChatGPT→AppServer catalog conversion with a curated
 * Chat power list, and subscribe the picker to mode changes so it updates
 * instantly.
 *
 * Why v38 failed:
 * - Grouping ChatGPT options (incl. internal) by slug pulled in thinkingEffort
 *   values like `max`, which Ve() accepts — UI showed a bogus "max" level.
 * - mk read CDRRuntime.mode() without React subscribe → list didn't refresh
 *   on Chat/Work/Codex switch.
 *
 * Chat mode picker: Sol High, Sol Medium, 5.5 Instant, o3
 * Work/Codex: native curated Cg(y,l) Sol/Terra power list
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const SETTINGS = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const MARKER = "codex-rebuild:chat-models-v39";

const CHAT_HELPERS =
  "function CDRChatPowerSelections(){return[{id:`gpt-5.6-sol:high`,model:`gpt-5.6-sol`,modelLabel:`Sol High`,reasoningEffort:`high`,powerSettingIndex:0},{id:`gpt-5.6-sol:medium`,model:`gpt-5.6-sol`,modelLabel:`Sol Medium`,reasoningEffort:`medium`,powerSettingIndex:1},{id:`gpt-5.5:none`,model:`gpt-5.5`,modelLabel:`5.5 Instant`,reasoningEffort:`none`,powerSettingIndex:2},{id:`o3:medium`,model:`o3`,modelLabel:`o3`,reasoningEffort:`medium`,powerSettingIndex:3}]}function CDRChatModelsForPicker(){return[{id:`gpt-5.6-sol`,model:`gpt-5.6-sol`,displayName:`Sol`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`high`,description:`Sol High`},{reasoningEffort:`medium`,description:`Sol Medium`}],defaultReasoningEffort:`high`,isDefault:!0},{id:`gpt-5.5`,model:`gpt-5.5`,displayName:`5.5 Instant`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`none`,description:`5.5 Instant`}],defaultReasoningEffort:`none`,isDefault:!1},{id:`o3`,model:`o3`,displayName:`o3`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`medium`,description:`o3`}],defaultReasoningEffort:`medium`,isDefault:!1}]}";

function assert(c, m) {
  if (!c) throw new Error(m);
}
function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1, got ${n}`);
  return src.replace(from, to);
}

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep|chat-models-v39/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  } catch {}
}

function stripV38(src) {
  let out = src;
  if (out.includes("chat-models-v38") || out.includes("CDRChatY")) {
    // Remove useState for CDRChatY
    out = replaceOnce(
      out,
      "[u,d]=(0,_k.useState)(null),[CDRChatY,CDRSetChatY]=(0,_k.useState)(null),f=Rl(e)",
      "[u,d]=(0,_k.useState)(null),f=Rl(e)",
      "strip CDRChatY useState",
    );

    // Restore y=_?.models — v38 wrapped it in IIFE
    const yStart = out.indexOf(
      "{data:_,status:v}=Ga({hostId:f.hostId}),y=(()=>{/* codex-rebuild:chat-models-v38:y */",
    );
    assert(yStart >= 0, "v38 y anchor missing");
    const yEnd = out.indexOf("return _?.models})(),{modelSettings:S", yStart);
    assert(yEnd > yStart, "v38 y end missing");
    out =
      out.slice(0, yStart) +
      "{data:_,status:v}=Ga({hostId:f.hostId}),y=_?.models,{modelSettings:S" +
      out.slice(yEnd + "return _?.models})(),{modelSettings:S".length);

    // Restore te=Cg(y,l),ne=Ug(y)
    out = replaceOnce(
      out,
      "te=CDRRuntime.mode()===`chat`?Ug(y):Cg(y,l),ne=Ug(y)/* codex-rebuild:chat-models-v38:te */",
      "te=Cg(y,l),ne=Ug(y)",
      "strip v38 te",
    );

    // Remove load effect between registerModelController and let de=
    const loadStart = out.indexOf(
      "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);(0,_k.useEffect)(()=>{/* codex-rebuild:chat-models-v38:load */",
    );
    assert(loadStart >= 0, "v38 load anchor missing");
    const loadEnd = out.indexOf("},[CDRRuntime,o,V_]);let de=", loadStart);
    assert(loadEnd > loadStart, "v38 load end missing");
    out =
      out.slice(0, loadStart) +
      "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);let de=" +
      out.slice(loadEnd + "},[CDRRuntime,o,V_]);let de=".length);
  }

  assert(!out.includes("chat-models-v38"), "v38 remnants remain");
  assert(!out.includes("CDRChatY"), "CDRChatY remnant");
  return out;
}

function patchSettings(src) {
  if (src.includes(MARKER)) {
    console.log("settings already v39");
    return src;
  }

  let out = stripV38(src);

  // 1) Mode subscription + helpers right after runtime install marker
  out = replaceOnce(
    out,
    "function mk({conversationId:e,hideLabel:t,permissionsCwdOverride:i,permissionsHostId:a}){/* codex-rebuild:local-canonical-model-picker-v5 */let CDRRuntime=(function installLocalModeRuntime()",
    "function mk({conversationId:e,hideLabel:t,permissionsCwdOverride:i,permissionsHostId:a}){/* codex-rebuild:local-canonical-model-picker-v5 */" +
      CHAT_HELPERS +
      "/* " +
      MARKER +
      ":helpers */let CDRRuntime=(function installLocalModeRuntime()",
    "inject chat helpers",
  );

  // After the IIFE that creates CDRRuntime, add mode state subscribe.
  // Anchor: end of installLocalModeRuntime IIFE close before `let o=n(O)`
  out = replaceOnce(
    out,
    "s.__cdrLocalModeV4; })();let o=n(O);n(Nt);let c=s(xk),l=b(re.showUltraInModelPickerSlider),[u,d]=(0,_k.useState)(null),f=Rl(e)",
    "s.__cdrLocalModeV4; })();let[CDRMode,CDRSetMode]=(0,_k.useState)(()=>CDRRuntime.mode());(0,_k.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);/* " +
      MARKER +
      ":mode */let o=n(O);n(Nt);let c=s(xk),l=b(re.showUltraInModelPickerSlider),[u,d]=(0,_k.useState)(null),f=Rl(e)",
    "mode subscribe",
  );

  // 2) y: in chat use curated models only (no AppServer max/ultra dump)
  out = replaceOnce(
    out,
    "{data:_,status:v}=Ga({hostId:f.hostId}),y=_?.models,{modelSettings:S",
    "{data:_,status:v}=Ga({hostId:f.hostId}),y=CDRMode===`chat`?CDRChatModelsForPicker():_?.models/* " +
      MARKER +
      ":y */,{modelSettings:S",
    "chat curated y",
  );

  // 3) te: curated discrete Chat power rows; Work/Codex keep Cg
  out = replaceOnce(
    out,
    "te=Cg(y,l),ne=Ug(y)",
    "te=CDRMode===`chat`?CDRChatPowerSelections():Cg(y,l),ne=Ug(y)/* " +
      MARKER +
      ":te */",
    "chat curated te",
  );

  return out;
}

function verify(st) {
  assert(st.includes(MARKER + ":helpers"), "missing helpers");
  assert(st.includes(MARKER + ":mode"), "missing mode subscribe");
  assert(st.includes(MARKER + ":y"), "missing y");
  assert(st.includes(MARKER + ":te"), "missing te");
  assert(st.includes("CDRChatPowerSelections"), "missing power helper");
  assert(st.includes("modelLabel:`5.5 Instant`"), "missing Instant");
  assert(st.includes("modelLabel:`o3`"), "missing o3");
  assert(st.includes("CDRRuntime.subscribe(CDRSetMode)"), "missing subscribe");
  assert(!st.includes("chat-models-v38"), "v38 still present");
  assert(!st.includes("CDRChatY"), "CDRChatY still present");
  assert(!st.includes("__cdrPublishChatPickerModels"), "publish remnant in settings");
  try {
    acorn.parse(st, { ecmaVersion: "latest", sourceType: "module" });
  } catch (err) {
    throw new Error(`settings parse failed: ${err.message}`);
  }
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-chat-models-v39.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of [
    path.join(
      os.homedir(),
      "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
    ),
    "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
  ]) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v39-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
let settings = fs.readFileSync(SETTINGS, "utf8");
settings = patchSettings(settings);
fs.writeFileSync(SETTINGS, settings);
verify(settings);
if (process.argv.includes("--check")) process.exit(0);
install();
console.log(
  "done — quit/reopen Codex; Chat = Sol High/Medium + 5.5 Instant + o3; switches update instantly",
);
