#!/usr/bin/env node
"use strict";
/**
 * v38: Fix broken Chat model picker.
 *
 * v37 swapped ChatGPT models into `y` but still used `Cg(y)` which only keeps
 * curated Sol/Terra power rows — picker went empty/broken.
 *
 * Fix:
 * - Keep a clean useState + useEffect (not jammed into an invalid let slot)
 * - In Chat mode, use ChatGPT catalog for `y`
 * - In Chat mode, build powerSelections with `Ug(y)` (all models), not `Cg(y,l)`
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
const MARKER = "codex-rebuild:chat-models-v38";

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
      if (/cursor-agent|grep|chat-models-v38/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  } catch {}
}

const PUBLISH_FN =
  "globalThis.__cdrPublishChatPickerModels=function(data){try{if(!data||typeof data!==`object`)return null;let opts=[...data.options||[],...data.internalOptions||[]];let by=new Map;for(let opt of opts){if(!opt||typeof opt.slug!==`string`||!opt.slug)continue;if(opt.hidden===!0)continue;let m=by.get(opt.slug);if(!m){m={id:opt.slug,model:opt.slug,displayName:opt.title||opt.selectedLabel||opt.slug,description:typeof opt.description===`string`?opt.description:``,hidden:!1,supportedReasoningEfforts:[],defaultReasoningEffort:`medium`,isDefault:opt.slug===data.defaultModelSlug};by.set(opt.slug,m)}let effort=opt.thinkingEffort||opt.reasoningEffort;if(effort&&!m.supportedReasoningEfforts.some(e=>e.reasoningEffort===effort))m.supportedReasoningEfforts.push({reasoningEffort:effort,description:opt.selectedLabel||opt.title||``})}for(let m of by.values()){if(!m.supportedReasoningEfforts.length)m.supportedReasoningEfforts.push({reasoningEffort:`medium`,description:``});if(!m.defaultReasoningEffort)m.defaultReasoningEffort=m.supportedReasoningEfforts[0].reasoningEffort}let list=[...by.values()];if(!list.length)return null;globalThis.__cdrChatPickerModels=list;globalThis.__cdrChatDefaultSlug=data.defaultModelSlug||list.find(e=>e.isDefault)?.model||list[0].model;return list}catch{return null}};";

function stripV37(src) {
  // Remove the broken inline useState/useEffect jammed into the Ga/y let list.
  const start = src.indexOf(
    ",[CDRChatY,CDRSetChatY]=(0,_k.useState)(()=>globalThis.__cdrChatPickerModels||null),CDRChatLoadEffect=((0,_k.useEffect)(()=>{/* codex-rebuild:chat-models-v37:picker */",
  );
  if (start < 0) {
    // maybe already stripped or never applied this exact form
    if (src.includes("chat-models-v37:picker")) {
      throw new Error("v37 picker present but anchor mismatch — manual inspect needed");
    }
    return src;
  }
  const end = src.indexOf(
    "},[CDRRuntime,o])),y=CDRRuntime.mode()===`chat`&&Array.isArray(CDRChatY)&&CDRChatY.length?CDRChatY:_?.models",
    start,
  );
  assert(end > start, "v37 end anchor missing");
  const endLen =
    "},[CDRRuntime,o])),y=CDRRuntime.mode()===`chat`&&Array.isArray(CDRChatY)&&CDRChatY.length?CDRChatY:_?.models"
      .length;
  return (
    src.slice(0, start) +
    ",y=_?.models" +
    src.slice(end + endLen)
  );
}

function patchSettings(src) {
  if (src.includes(MARKER)) {
    console.log("settings already v38");
    return src;
  }

  let out = stripV37(src);
  assert(out.includes(",y=_?.models,{modelSettings:S"), "failed to restore y=_?.models");

  // 1) Add useState next to existing menu-view useState
  out = replaceOnce(
    out,
    "[u,d]=(0,_k.useState)(null),f=Rl(e)",
    "[u,d]=(0,_k.useState)(null),[CDRChatY,CDRSetChatY]=(0,_k.useState)(null),f=Rl(e)",
    "chat models useState",
  );

  // 2) y: prefer ChatGPT catalog in chat mode
  out = replaceOnce(
    out,
    "{data:_,status:v}=Ga({hostId:f.hostId}),y=_?.models,{modelSettings:S",
    "{data:_,status:v}=Ga({hostId:f.hostId}),y=(()=>{/* " +
      MARKER +
      ":y */try{if(CDRRuntime.mode()===`chat`){let m=CDRChatY||globalThis.__cdrChatPickerModels;if(Array.isArray(m)&&m.length)return m}}catch{}return _?.models})(),{modelSettings:S",
    "chat mode y catalog",
  );

  // 3) te: in chat mode use full list (Ug/so), not curated Sol/Terra (Cg/io)
  out = replaceOnce(
    out,
    "te=Cg(y,l),ne=Ug(y)",
    "te=CDRRuntime.mode()===`chat`?Ug(y):Cg(y,l),ne=Ug(y)/* " + MARKER + ":te */",
    "chat mode powerSelections",
  );

  // 4) Load ChatGPT models in a real statement after registerModelController effect
  out = replaceOnce(
    out,
    "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);let de=",
    "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);(0,_k.useEffect)(()=>{/* " +
      MARKER +
      ":load */" +
      PUBLISH_FN +
      "if(CDRRuntime.mode()!==`chat`){CDRSetChatY(null);return}let alive=!0;(async()=>{try{let client=o.get(V_);if(!client||typeof client.models!==`function`)return;let data=await client.models();try{if(typeof client.internalModels===`function`){let internal=await client.internalModels();if(internal)data={...data,internalOptions:Array.isArray(internal)?internal:internal?.options||data.internalOptions}}}catch{}let list=globalThis.__cdrPublishChatPickerModels(data);if(alive&&list)CDRSetChatY(list)}catch(err){try{console.warn(`[${MARKER}]`,err)}catch{}}})();return()=>{alive=!1}},[CDRRuntime,o,V_]);let de=",
    "chat models loader effect",
  );

  return out;
}

function ensureChatPublish(src) {
  if (src.includes("chat-models-v37:publish") || src.includes(MARKER + ":publish")) {
    return src;
  }
  // Apply the v37 publish hooks if missing
  let out = src;
  if (out.includes("enabled:!1,queryFn:()=>e.get(L).internalModels()")) {
    out = replaceOnce(
      out,
      "bp=m(p,({scope:e})=>({enabled:!1,queryFn:()=>e.get(L).internalModels(),queryKey:[`chatgpt-models`,`internal`],staleTime:S.FIVE_MINUTES}))",
      "bp=m(p,({scope:e})=>({enabled:!0,queryFn:()=>e.get(L).internalModels(),queryKey:[`chatgpt-models`,`internal`],staleTime:S.FIVE_MINUTES}))/* " +
        MARKER +
        ":internal */",
      "enable internal",
    );
  }
  if (
    out.includes(
      "xp=o(p,({get:e})=>{let t=e(yp),n=e(bp).data;return t.data==null||n==null?t:{...t,data:{...t.data,internalOptions:n}}})",
    )
  ) {
    out = replaceOnce(
      out,
      "xp=o(p,({get:e})=>{let t=e(yp),n=e(bp).data;return t.data==null||n==null?t:{...t,data:{...t.data,internalOptions:n}}})",
      "xp=o(p,({get:e})=>{/* " +
        MARKER +
        ":publish */" +
        PUBLISH_FN +
        "let t=e(yp),n=e(bp).data;let out=t.data==null||n==null?t:{...t,data:{...t.data,internalOptions:n}};try{globalThis.__cdrPublishChatPickerModels?.(out?.data)}catch{}return out})",
      "publish catalog",
    );
  }
  return out;
}

function verify(st, ch) {
  assert(st.includes(MARKER + ":y"), "missing y marker");
  assert(st.includes(MARKER + ":te"), "missing te marker");
  assert(st.includes(MARKER + ":load"), "missing load marker");
  assert(!st.includes("chat-models-v37:picker"), "v37 picker remnant");
  assert(st.includes("te=CDRRuntime.mode()===`chat`?Ug(y):Cg(y,l)"), "te not using Ug in chat");
  assert(st.includes(",y=_?.models") === false || st.includes(MARKER + ":y"), "y not patched");
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
  const packed = path.join(ROOT, "out", "app-chat-models-v38.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v38-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
let settings = fs.readFileSync(SETTINGS, "utf8");
let chat = fs.readFileSync(CHAT, "utf8");
settings = patchSettings(settings);
chat = ensureChatPublish(chat);
fs.writeFileSync(SETTINGS, settings);
fs.writeFileSync(CHAT, chat);
verify(settings, chat);
if (process.argv.includes("--check")) process.exit(0);
install();
console.log("done — quit/reopen Codex; Chat picker should list ChatGPT models");
