#!/usr/bin/env node
"use strict";
/**
 * Targeted fix: Chat mode model picker uses ChatGPT /models catalog
 * (Instant / GPT-5.x / o-series), not AppServer Sol/Terra/Luna.
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
const CHAT = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
const PATCH = path.join(ROOT, "scripts/patch-local-canonical-mode.js");
const MARKER = "codex-rebuild:chat-models-v37";

function assert(c, m) {
  if (!c) throw new Error(m);
}
function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1, got ${n}`);
  return src.replace(from, to);
}
function replaceAllExact(src, from, to, label, expected) {
  const n = src.split(from).length - 1;
  assert(n === expected, `${label}: expected ${expected}, got ${n}`);
  return src.split(from).join(to);
}

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep|chat-models-v37/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  } catch {}
}

// Runtime helper: ChatGPT catalog -> AppServer picker model list
const PUBLISH_FN =
  "globalThis.__cdrPublishChatPickerModels=function(data){try{if(!data||typeof data!==`object`)return null;let opts=[...data.options||[],...data.internalOptions||[]];let by=new Map;for(let o of opts){if(!o||typeof o.slug!==`string`||!o.slug)continue;if(o.hidden===!0)continue;let m=by.get(o.slug);if(!m){m={model:o.slug,displayName:o.title||o.selectedLabel||o.slug,description:typeof o.description===`string`?o.description:``,hidden:!1,supportedReasoningEfforts:[],isDefault:o.slug===data.defaultModelSlug};by.set(o.slug,m)}let effort=o.thinkingEffort||o.reasoningEffort;if(effort&&!m.supportedReasoningEfforts.some(e=>e.reasoningEffort===effort))m.supportedReasoningEfforts.push({reasoningEffort:effort,description:o.selectedLabel||o.title||``})}for(let m of by.values()){if(!m.supportedReasoningEfforts.length)m.supportedReasoningEfforts.push({reasoningEffort:`medium`,description:``})}let list=[...by.values()];if(!list.length)return null;globalThis.__cdrChatPickerModels=list;globalThis.__cdrChatDefaultSlug=data.defaultModelSlug||list.find(e=>e.isDefault)?.model||list[0].model;return list}catch{return null}};";

function patchChat(src) {
  if (src.includes(MARKER + ":internal")) {
    console.log("chat module already patched");
    return src;
  }
  let out = src;
  out = replaceOnce(
    out,
    "bp=m(p,({scope:e})=>({enabled:!1,queryFn:()=>e.get(L).internalModels(),queryKey:[`chatgpt-models`,`internal`],staleTime:S.FIVE_MINUTES}))",
    "bp=m(p,({scope:e})=>({enabled:!0,queryFn:()=>e.get(L).internalModels(),queryKey:[`chatgpt-models`,`internal`],staleTime:S.FIVE_MINUTES}))/* " +
      MARKER +
      ":internal */",
    "enable internal models",
  );
  out = replaceOnce(
    out,
    "xp=o(p,({get:e})=>{let t=e(yp),n=e(bp).data;return t.data==null||n==null?t:{...t,data:{...t.data,internalOptions:n}}})",
    "xp=o(p,({get:e})=>{/* " +
      MARKER +
      ":publish */" +
      PUBLISH_FN +
      "let t=e(yp),n=e(bp).data;let out=t.data==null||n==null?t:{...t,data:{...t.data,internalOptions:n}};try{globalThis.__cdrPublishChatPickerModels?.(out?.data)}catch{}return out})",
    "publish on catalog read",
  );
  return out;
}

function patchSettings(src) {
  if (src.includes(MARKER + ":picker")) {
    console.log("settings already patched");
    return src;
  }
  let out = src;

  // Chat preset should not force Sol Medium.
  out = replaceAllExact(
    out,
    `chat: Object.freeze({
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
    })`,
    `chat: Object.freeze({
      model: "auto",
      reasoningEffort: "medium",
    })`,
    "chat preset auto",
    2,
  );

  // Resolve chat preset from ChatGPT catalog when switching modes.
  out = replaceAllExact(
    out,
    "const result = controller(presetSettings[next]);",
    "let CDRApply=presetSettings[next];if(next===`chat`){try{let slug=globalThis.__cdrChatDefaultSlug||(globalThis.__cdrChatPickerModels||[]).find(e=>e.model===`auto`)?.model||globalThis.__cdrChatPickerModels?.[0]?.model;if(slug){let hit=(globalThis.__cdrChatPickerModels||[]).find(e=>e.model===slug);CDRApply={model:slug,reasoningEffort:hit?.supportedReasoningEfforts?.[0]?.reasoningEffort||`medium`}}}catch{}}const result = controller(CDRApply);",
    "resolve chat preset from chatgpt catalog",
    2,
  );

  // After AppServer models load, also load ChatGPT catalog for Chat mode and swap y.
  const yOld =
    "{data:_,status:v}=Ga({hostId:f.hostId}),y=_?.models,{modelSettings:S,selectComposerModelAndReasoningEffort:C,setModelAndReasoningEffort:w}=uk({conversationId:e,cwdOverride:i,hostId:a}),T=S.model;";

  const yNew =
    "{data:_,status:v}=Ga({hostId:f.hostId}),[CDRChatY,CDRSetChatY]=(0,_k.useState)(()=>globalThis.__cdrChatPickerModels||null),CDRChatLoadEffect=((0,_k.useEffect)(()=>{/* " +
    MARKER +
    ":picker */" +
    PUBLISH_FN +
    "if(CDRRuntime.mode()!==`chat`)return;let alive=!0;(async()=>{try{let client=o.get(V_);if(!client||typeof client.models!==`function`)return;let data=await client.models();try{if(typeof client.internalModels===`function`){let internal=await client.internalModels();if(internal)data={...data,internalOptions:Array.isArray(internal)?internal:internal?.options||data.internalOptions}}}catch{}let list=globalThis.__cdrPublishChatPickerModels(data);if(alive&&list)CDRSetChatY(list)}catch{}})();return()=>{alive=!1}},[CDRRuntime,o])),y=CDRRuntime.mode()===`chat`&&Array.isArray(CDRChatY)&&CDRChatY.length?CDRChatY:_?.models,{modelSettings:S,selectComposerModelAndReasoningEffort:C,setModelAndReasoningEffort:w}=uk({conversationId:e,cwdOverride:i,hostId:a}),T=S.model;";

  out = replaceOnce(out, yOld, yNew, "chat mode picker catalog swap");
  return out;
}

function patchDurable(src) {
  if (src.includes(MARKER)) return src;
  let out = src;
  out = replaceOnce(
    out,
    `chat: Object.freeze({
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
    })`,
    `chat: Object.freeze({
      model: "auto",
      reasoningEffort: "medium",
    })`,
    "durable chat preset",
  );
  if (out.includes("const result = controller(presetSettings[next]);")) {
    out = replaceOnce(
      out,
      "const result = controller(presetSettings[next]);",
      "let CDRApply=presetSettings[next];if(next===`chat`){try{let slug=globalThis.__cdrChatDefaultSlug||globalThis.__cdrChatPickerModels?.[0]?.model;if(slug){let hit=(globalThis.__cdrChatPickerModels||[]).find(e=>e.model===slug);CDRApply={model:slug,reasoningEffort:hit?.supportedReasoningEfforts?.[0]?.reasoningEffort||`medium`}}}catch{}}const result = controller(CDRApply);",
      "durable chat preset resolve",
    );
  }
  out =
    out +
    `\n// ${MARKER}: Chat mode picker loads ChatGPT /models via scripts/_apply-chat-models-v37.js\n`;
  return out;
}

function verify() {
  const st = fs.readFileSync(SETTINGS, "utf8");
  const ch = fs.readFileSync(CHAT, "utf8");
  assert(st.includes(MARKER + ":picker"), "missing picker marker");
  assert(st.includes("client.models"), "missing chatgpt models fetch");
  assert(st.includes('model: "auto"'), "chat preset not auto");
  assert(ch.includes(MARKER + ":internal"), "internal models not enabled");
  assert(ch.includes(MARKER + ":publish"), "publish hook missing");
  for (const [label, src] of [
    ["settings", st],
    ["chat", ch],
  ]) {
    try {
      acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
    } catch (err) {
      throw new Error(`${label} parse failed: ${err.message}`);
    }
  }
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-chat-models-v37.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v37-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
fs.writeFileSync(CHAT, patchChat(fs.readFileSync(CHAT, "utf8")));
fs.writeFileSync(SETTINGS, patchSettings(fs.readFileSync(SETTINGS, "utf8")));
if (fs.existsSync(PATCH)) {
  fs.writeFileSync(PATCH, patchDurable(fs.readFileSync(PATCH, "utf8")));
  console.log("updated patch-local-canonical-mode.js");
}
verify();
if (process.argv.includes("--check")) process.exit(0);
install();
console.log("done — quit/reopen Codex; Chat mode should show ChatGPT models");
