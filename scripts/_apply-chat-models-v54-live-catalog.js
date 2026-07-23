#!/usr/bin/env node
"use strict";
/**
 * v54: Chat mode model picker + bridge use LIVE ChatGPT /models catalog.
 *
 * Why Sol 422s:
 *   CDRMergeChatModels / CDRChatPowerSelections hardcode `gpt-5.6-sol`, which
 *   ChatGPT conversation API rejects for this account (HTTP 422).
 *
 * Fix (keep sticky Chat, discrete picker, no slider/fast mode):
 * 1) CDRMergeChatModels passes through live Hn(catalog) and publishes discrete rows
 * 2) CDRChatPowerSelections / CDRChatModelsForPicker read that live cache
 * 3) mk loads client.models() in Chat mode and refreshes the picker
 * 4) If persisted model isn't in the live list, switch to catalog default
 * 5) Bridge defaults to __cdrChatDefaultSlug (never hardcoded sol)
 * 6) Keep K=false in Chat (no power slider / fast mode)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:chat-models-v54";

const CHAT = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("nmo0zeut") && f.endsWith(".js")),
);
const SETTINGS = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js")),
);
const SEND = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("oxnpxkxc") && f.endsWith(".js")),
);

const LIVE = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

function assert(c, m) {
  if (!c) throw new Error(m);
}
function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1 got ${n}`);
  return src.replace(from, to);
}
function parseOk(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
}
function extractFn(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  assert(start >= 0, "missing " + startNeedle.slice(0, 60));
  let depth = 0,
    started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      started = true;
    } else if (src[i] === "}") {
      depth--;
      if (started && depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error("unclosed " + startNeedle.slice(0, 40));
}
function killCodex() {
  try {
    execSync(
      "pkill -f 'CodexDesktop-Rebuild/Codex.app' || true; pkill -f 'Codex.payload' || true",
      { stdio: "ignore" },
    );
  } catch {}
}

const MERGE_HELPER =
  "function CDRMergeChatModels(e){/* " +
  MARKER +
  ":merge */try{" +
  "if(!e||typeof e!==`object`)return e;" +
  "let opts=[...Array.isArray(e.options)?e.options:[],...Array.isArray(e.versionOptions)?e.versionOptions.flatMap(v=>Array.isArray(v&&v.options)?v.options:[]):[]];" +
  "let seen=new Set,rows=[],by=new Map;" +
  "for(let o of opts){" +
  "if(!o||typeof o.slug!==`string`||!o.slug||o.hidden===!0)continue;" +
  "let effort=o.thinkingEffort==null||o.thinkingEffort===``?`none`:String(o.thinkingEffort);" +
  // skip bogus internal ladder values that aren't Chat conversation efforts
  "if(effort===`max`||effort===`xhigh`||effort===`xxhigh`)continue;" +
  "let id=o.slug+`:`+effort;if(seen.has(id))continue;seen.add(id);" +
  "let label=String(o.selectedLabel||o.title||o.slug);" +
  "rows.push({id,model:o.slug,modelLabel:label,reasoningEffort:effort,powerSettingIndex:rows.length,lane:o.lane||null});" +
  "let m=by.get(o.slug);if(!m){m={id:o.slug,model:o.slug,displayName:String(o.title||o.selectedLabel||o.slug),description:typeof o.description===`string`?o.description:``,hidden:!1,supportedReasoningEfforts:[],defaultReasoningEffort:effort,isDefault:o.slug===(e.defaultModelSlug||``)};by.set(o.slug,m)}" +
  "if(!m.supportedReasoningEfforts.some(x=>x.reasoningEffort===effort))m.supportedReasoningEfforts.push({reasoningEffort:effort,description:label});" +
  "if(m.displayName==m.model&&o.selectedLabel)m.displayName=String(o.title||o.selectedLabel);" +
  "}" +
  "if(!rows.length)return e;" +
  "let defSlug=e.defaultModelSlug&&rows.some(r=>r.model===e.defaultModelSlug)?e.defaultModelSlug:rows[0].model;" +
  "for(let m of by.values())m.isDefault=m.model===defSlug;" +
  "globalThis.__cdrChatCatalog=e;" +
  "globalThis.__cdrChatDefaultSlug=defSlug;" +
  "globalThis.__cdrChatPowerRows=rows;" +
  "globalThis.__cdrChatPickerModels=[...by.values()];" +
  "try{window.dispatchEvent(new CustomEvent(`cdr-chat-models-change`,{detail:{count:rows.length,defaultModelSlug:defSlug}}))}catch{}" +
  // Pass through LIVE catalog for native ChatGPT UI; sticky Chat reads __cdrChatPowerRows
  "return e;" +
  "}catch(err){try{console.error(`[cdr] CDRMergeChatModels`,err)}catch{}return e}}";

const CHAT_HELPERS =
  "function CDRChatPowerSelections(){/* " +
  MARKER +
  ":helpers */let rows=globalThis.__cdrChatPowerRows;if(Array.isArray(rows)&&rows.length)return rows;" +
  "return[{id:`auto:none`,model:`auto`,modelLabel:`Auto`,reasoningEffort:`none`,powerSettingIndex:0}]}" +
  "function CDRChatModelsForPicker(){let list=globalThis.__cdrChatPickerModels;if(Array.isArray(list)&&list.length)return list;" +
  "return[{id:`auto`,model:`auto`,displayName:`Auto`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`none`,description:`Auto`}],defaultReasoningEffort:`none`,isDefault:!0}]}";

function patchChat(src) {
  let out = src;

  // Replace CDRMergeChatModels body (v41 hardcoded Sol list)
  assert(out.includes("function CDRMergeChatModels("), "CDRMergeChatModels missing");
  const old = extractFn(out, "function CDRMergeChatModels(");
  // Include trailing marker comment if present
  let end = old.end;
  const after = out.slice(end, end + 80);
  const m = after.match(/^\/\* codex-rebuild:[^*]+\*\//);
  if (m) end += m[0].length;
  out = out.slice(0, old.start) + MERGE_HELPER + out.slice(end);

  // Soften parse-fail placeholder away from dead Sol slug
  if (out.includes("ir=`gpt-5.6-sol`")) {
    out = replaceOnce(
      out,
      "ir=`gpt-5.6-sol`",
      "ir=`auto`/* " + MARKER + ":placeholder-slug */",
      "placeholder slug",
    );
  }

  return out;
}

const CDR_UNKNOWN_EFFORT_DESCRIPTOR =
  "{id:`composer.mode.local.reasoning.unknown.label`,defaultMessage:`Unknown`,description:`Reasoning effort label for an unknown effort`}";

// Re-wrap the picker's effort message map so formatMessage(Cb[key]) never receives
// undefined when the live ChatGPT /models catalog publishes an effort string that
// is not one of the statically known {none,minimal,low,medium,high,xhigh,max,ultra}.
// Without this guard, [@formatjs/intl] throws "An `id` must be provided" on send.
function guardEffortDescriptorMap(src, label) {
  if (src.includes("const CDRUnknownEffortDescriptor/*" + MARKER + ":effort-guard*/")) {
    return src;
  }
  // The picker bundle imports the descriptor map as `A as Cb` from the ke3j1rk8
  // chunk. Rename the imported binding and re-wrap it with a Proxy that returns a
  // well-formed fallback descriptor for unknown keys.
  const importAlias = "A as Cb,";
  if (!src.includes(importAlias)) {
    throw new Error(
      `${label}: expected import anchor "A as Cb," not found; the picker bundle no longer reads the effort descriptor map under that alias`,
    );
  }
  let out = src.replace(importAlias, "A as __CDRCbRaw,");
  if (out === src) {
    throw new Error(`${label}: failed to rename import alias "A as Cb"`);
  }
  // Insert the guard immediately before the first statement that follows the last
  // top-level import. The bundle's imports occupy the first line; we anchor on the
  // end of that first line (the closing newline after the final import).
  const firstNewline = out.indexOf("\n");
  if (firstNewline < 0) {
    throw new Error(`${label}: bundle has no newline before first statement`);
  }
  const guard =
    "const CDRUnknownEffortDescriptor/*" + MARKER + ":effort-guard*/=" +
    CDR_UNKNOWN_EFFORT_DESCRIPTOR +
    ";const Cb=new Proxy(__CDRCbRaw,{get(t,k){if(typeof k!==`string`||k in t)return t[k];return CDRUnknownEffortDescriptor}});";
  out = out.slice(0, firstNewline) + guard + out.slice(firstNewline);
  return out;
}

function patchSettings(src) {
  let out = src;

  // Replace both helper functions
  assert(out.includes("function CDRChatPowerSelections()"), "power helpers missing");
  const start = out.indexOf("function CDRChatPowerSelections()");
  const modelsFn = extractFn(out, "function CDRChatModelsForPicker(){");
  // Keep following sticky-chat-v43:helpers comment if present by stopping at modelsFn.end
  out = out.slice(0, start) + CHAT_HELPERS + out.slice(modelsFn.end);

  // Guard the picker's effort message map so an unknown effort string returned by
  // the live ChatGPT /models catalog never reaches formatMessage as undefined.
  out = guardEffortDescriptorMap(out, "settings");

  // Ensure Chat stays on discrete model-row layout (no slider)
  if (!out.includes("K=CDRMode===`chat`?!1:")) {
    out = replaceOnce(
      out,
      "K=g&&te.length>=4&&!V&&v!==`error`",
      "K=CDRMode===`chat`?!1:g&&te.length>=4&&!V&&v!==`error`/* " +
        MARKER +
        ":picker-layout */",
      "force discrete chat layout",
    );
  } else if (!out.includes(MARKER + ":picker-layout")) {
    out = out.replace(
      "K=CDRMode===`chat`?!1:g&&te.length>=4&&!V&&v!==`error`/* codex-rebuild:sticky-chat-v45:picker-layout */",
      "K=CDRMode===`chat`?!1:g&&te.length>=4&&!V&&v!==`error`/* " +
        MARKER +
        ":picker-layout */",
    );
  }

  // Make y/te observe live tick so picker re-renders after /models fetch
  const yOld =
    "y=CDRMode===`chat`?CDRChatModelsForPicker():_?.models/* codex-rebuild:sticky-chat-v43:y */";
  const yNew =
    "y=(CDRChatTick,CDRMode===`chat`?CDRChatModelsForPicker():_?.models)/* " +
    MARKER +
    ":y */";
  if (out.includes(yOld)) {
    out = replaceOnce(out, yOld, yNew, "y live tick");
  } else if (out.includes("y=CDRMode===`chat`?CDRChatModelsForPicker():_?.models")) {
    out = replaceOnce(
      out,
      "y=CDRMode===`chat`?CDRChatModelsForPicker():_?.models",
      "y=(CDRChatTick,CDRMode===`chat`?CDRChatModelsForPicker():_?.models)/* " +
        MARKER +
        ":y */",
      "y live tick loose",
    );
  } else {
    assert(out.includes(MARKER + ":y") || out.includes("CDRChatTick"), "y anchor missing");
  }

  const teOld =
    "te=CDRMode===`chat`?CDRChatPowerSelections():Cg(y,l),ne=Ug(y)/* codex-rebuild:sticky-chat-v43:picker */";
  const teNew =
    "te=(CDRChatTick,CDRMode===`chat`?CDRChatPowerSelections():Cg(y,l)),ne=Ug(y)/* " +
    MARKER +
    ":te */";
  if (out.includes(teOld)) {
    out = replaceOnce(out, teOld, teNew, "te live tick");
  } else if (out.includes("te=CDRMode===`chat`?CDRChatPowerSelections():Cg(y,l)")) {
    out = replaceOnce(
      out,
      "te=CDRMode===`chat`?CDRChatPowerSelections():Cg(y,l),ne=Ug(y)",
      "te=(CDRChatTick,CDRMode===`chat`?CDRChatPowerSelections():Cg(y,l)),ne=Ug(y)/* " +
        MARKER +
        ":te */",
      "te live tick loose",
    );
  }

  // Add tick state + fetch effect after mode subscribe
  if (!out.includes(MARKER + ":load")) {
    const modeAnchor =
      "let[CDRMode,CDRSetMode]=(0,_k.useState)(()=>CDRRuntime.mode());(0,_k.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);/* codex-rebuild:sticky-chat-v43:mode */";
    assert(out.includes(modeAnchor) || out.includes("CDRRuntime.subscribe(CDRSetMode)"), "mode subscribe missing");
    if (out.includes(modeAnchor)) {
      out = replaceOnce(
        out,
        modeAnchor,
        modeAnchor +
          "let[CDRChatTick,CDRSetChatTick]=(0,_k.useState)(0);/* " +
          MARKER +
          ":tick */",
        "chat tick state",
      );
    } else {
      out = replaceOnce(
        out,
        "(0,_k.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);",
        "(0,_k.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);let[CDRChatTick,CDRSetChatTick]=(0,_k.useState)(0);/* " +
          MARKER +
          ":tick */",
        "chat tick state loose",
      );
    }

    // Load after model controller registration (w is in scope)
    const reg =
      "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);";
    assert(out.includes(reg), "registerModelController anchor missing");
    const load =
      reg +
      "(0,_k.useEffect)(()=>{/* " +
      MARKER +
      ":load */if(CDRMode!==`chat`)return;let alive=!0;(async()=>{try{let client=null;try{client=o.get(V_)}catch{}if(!client||typeof client.models!==`function`){try{client=globalThis.__cdrEnsureChatClient&&globalThis.__cdrEnsureChatClient()}catch{client=null}}if(!client||typeof client.models!==`function`)return;await client.models();if(!alive)return;CDRSetChatTick(e=>e+1);let rows=globalThis.__cdrChatPowerRows||[];if(!rows.length)return;let curModel=T,curEffort=S&&S.reasoningEffort;let ok=rows.some(r=>r.model===curModel&&(curEffort==null||r.reasoningEffort===curEffort||(curEffort===`none`&&(r.reasoningEffort===`none`||r.lane===`instant`))));if(!ok){let hit=rows.find(r=>r.model===(globalThis.__cdrChatDefaultSlug||rows[0].model))||rows[0];try{w(hit.model,hit.reasoningEffort===`none`?`none`:hit.reasoningEffort)}catch{}}}catch(err){try{console.error(`[cdr] chat models load`,err)}catch{}}})();let onCh=()=>{if(alive)CDRSetChatTick(e=>e+1)};try{window.addEventListener(`cdr-chat-models-change`,onCh)}catch{}return()=>{alive=!1;try{window.removeEventListener(`cdr-chat-models-change`,onCh)}catch{}}},[CDRMode,o,w,T,S]);";
    out = replaceOnce(out, reg, load, "chat models load effect");
  }

  return out;
}

function patchSend(src) {
  let out = src;
  // Bridge default model: live catalog default, never hardcoded sol
  const bad =
    "let model=(n&&(n.model||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model)))||`gpt-5.6-sol`;let effort=(n&&(n.effort||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.reasoning_effort)))||`high`;if(effort===`none`||effort===`minimal`)effort=void 0;";
  const good =
    "let model=(n&&(n.model||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model)))||globalThis.__cdrChatDefaultSlug||`auto`;let effort=(n&&(n.effort||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.reasoning_effort)));if(effort==null){try{effort=(globalThis.__cdrChatCatalog&&globalThis.__cdrChatCatalog.defaultThinkingEffortByModelSlug&&globalThis.__cdrChatCatalog.defaultThinkingEffortByModelSlug[model])||(globalThis.__cdrChatPowerRows||[]).find(r=>r.model===model)?.reasoningEffort}catch{}effort=effort||`none`}/* " +
    MARKER +
    ":bridge-model */if(effort===`none`||effort===`minimal`)effort=void 0;" +
    // If model still looks like dead hardcoded sol and isn't in live rows, remap
    "try{let rows=globalThis.__cdrChatPowerRows;if(Array.isArray(rows)&&rows.length&&!rows.some(r=>r.model===model)){let hit=rows.find(r=>r.model===globalThis.__cdrChatDefaultSlug)||rows[0];model=hit.model;effort=hit.reasoningEffort===`none`||hit.reasoningEffort===`minimal`?void 0:hit.reasoningEffort}}catch{}";

  if (out.includes(bad)) {
    out = replaceOnce(out, bad, good, "bridge live model default");
  } else if (out.includes(MARKER + ":bridge-model")) {
    console.log("bridge model already v54");
  } else if (out.includes("||`gpt-5.6-sol`;let effort=")) {
    // tolerate minor drift
    out = out.replace(
      /let model=\(n&&\(n\.model\|\|\(n\.collaborationMode&&n\.collaborationMode\.settings&&n\.collaborationMode\.settings\.model\)\)\)\|\|`gpt-5\.6-sol`;let effort=\(n&&\(n\.effort\|\|\(n\.collaborationMode&&n\.collaborationMode\.settings&&n\.collaborationMode\.settings\.reasoning_effort\)\)\)\|\|`high`;if\(effort===`none`\|\|effort===`minimal`\)effort=void 0;/,
      good,
    );
    assert(out.includes(MARKER + ":bridge-model"), "bridge model replace failed");
  } else {
    throw new Error("bridge model default anchor missing");
  }
  return out;
}

function verify(chat, settings, send) {
  assert(chat.includes(MARKER + ":merge"), "merge missing");
  assert(chat.includes("__cdrChatPowerRows"), "publish rows missing");
  assert(!chat.includes("selectedLabel:`Sol High`,slug:`gpt-5.6-sol`") || chat.includes(MARKER + ":merge"), "old sol merge still primary");
  // Old hardcoded merge body must be gone
  assert(!/function CDRMergeChatModels\(e\)\{const t=\[\{description:null,lane:`thinking`,selectedLabel:`Sol High`/.test(chat), "hardcoded Sol merge remains");
  assert(settings.includes(MARKER + ":helpers"), "helpers missing");
  assert(settings.includes(MARKER + ":load"), "load effect missing");
  assert(settings.includes(MARKER + ":y") || settings.includes("CDRChatTick"), "tick/y missing");
  assert(settings.includes("K=CDRMode===`chat`?!1:"), "discrete layout missing");
  assert(
    settings.includes(MARKER + ":effort-guard"),
    "effort descriptor guard missing (formatjs 'An `id` must be provided' regression)",
  );
  assert(send.includes(MARKER + ":bridge-model"), "bridge model missing");
  assert(send.includes("__cdrChatDefaultSlug"), "bridge default slug missing");
  parseOk("chat", chat);
  parseOk("settings", settings);
  parseOk("send", send);
  console.log("verify ok");
}

killCodex();
let chat = fs.readFileSync(CHAT, "utf8");
let settings = fs.readFileSync(SETTINGS, "utf8");
let send = fs.readFileSync(SEND, "utf8");

chat = patchChat(chat);
settings = patchSettings(settings);
send = patchSend(send);
verify(chat, settings, send);

fs.writeFileSync(CHAT, chat);
fs.writeFileSync(SETTINGS, settings);
fs.writeFileSync(SEND, send);
console.log("wrote sources");

if (process.argv.includes("--check")) process.exit(0);

const packed = path.join(ROOT, "out", "app-chat-models-v54.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
for (const dest of LIVE) {
  if (!fs.existsSync(dest)) {
    console.log("skip", dest);
    continue;
  }
  fs.copyFileSync(dest, `${dest}.bak-pre-v54-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log(
  "\nSUCCESS v54 — Chat picker/bridge now use live ChatGPT /models.\n" +
    "Fully quit Codex (Cmd+Q), reopen Chat mode. Options should match your account;\n" +
    "Sol will only appear if ChatGPT still offers it (no more hardcoded 422 slug).",
);


