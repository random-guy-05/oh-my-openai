#!/usr/bin/env node
"use strict";

/**
 * v56: expose the live ChatGPT catalog as flat native picker entries.
 *
 * v54 exposed two compatibility problems:
 * - its effect depended on unstable picker/controller values, so each catalog
 *   event could trigger another models() request and another catalog event;
 * - ChatGPT uses `standard` / `extended`, while the native Codex label table
 *   did not describe them, producing "Custom · Unknown".
 *
 * v55 keeps live account-specific models while:
 * - publishing/dispatching only when the derived catalog actually changes;
 * - loading on product-mode/client changes, not selection/render changes;
 * - preserving the API's selection values, supplying compatible labels, and
 *   never rewriting the user's current selection while the catalog loads.
 */

const acorn = require("acorn");
const asar = require("@electron/asar");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = process.env.CDR_ASAR_ROOT
  ? path.resolve(process.env.CDR_ASAR_ROOT)
  : path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER54 = "codex-rebuild:chat-models-v54";
const MARKER55 = "codex-rebuild:chat-models-v56";
const FORMAT_MARKER = "codex-rebuild:chat-models-v56:slider-label";
const LABEL_MARKER = "codex-rebuild:chat-models-v56:model-label";

function asset(namePart) {
  const name = fs
    .readdirSync(ASSETS)
    .find((entry) => entry.includes(namePart) && entry.endsWith(".js"));
  if (!name) throw new Error(`Missing asset containing ${namePart}`);
  return path.join(ASSETS, name);
}

const CHAT = asset("nmo0zeut");
const SETTINGS = asset("unq8yzli");
const SEND = asset("oxnpxkxc");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  assert(count === 1, `${label}: expected 1 match, found ${count}`);
  return source.replace(from, to);
}

function extractFunction(source, startNeedle) {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `Missing ${startNeedle}`);
  let depth = 0;
  let started = false;
  for (let index = start; index < source.length; index++) {
    if (source[index] === "{") {
      depth++;
      started = true;
    } else if (source[index] === "}") {
      depth--;
      if (started && depth === 0) return { start, end: index + 1 };
    }
  }
  throw new Error(`Unclosed function at ${startNeedle}`);
}

function parseOk(label, source) {
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${label}: ${error.message}\n${source.slice(Math.max(0,error.pos-2200),error.pos+300)}`);
  }
}

const MERGE_HELPER =
  "function CDRMergeChatModels(e){/* " +
  MARKER55 +
  ":merge */try{" +
  "if(!e||typeof e!==`object`)return e;" +
  "let versions=Array.isArray(e.versionOptions)?e.versionOptions:[],groupByKey=new Map;" +
  "for(let v of versions)for(let o of Array.isArray(v&&v.options)?v.options:[]){let a=o&&o.thinkingEffort==null?`none`:String(o&&o.thinkingEffort||`none`),k=o&&o.slug+`:`+a;if(o&&o.slug&&!groupByKey.has(k))groupByKey.set(k,String(v.label||v.title||v.id||``))}" +
  "let opts=[...Array.isArray(e.options)?e.options:[],...versions.flatMap(v=>Array.isArray(v&&v.options)?v.options:[])];" +
  "let seen=new Set,rows=[],models=[];" +
  "for(let o of opts){" +
  "if(!o||typeof o.slug!==`string`||!o.slug||o.hidden===!0)continue;" +
  "let apiEffort=o.thinkingEffort==null||o.thinkingEffort===``?`none`:String(o.thinkingEffort);" +
  "if(apiEffort===`max`||apiEffort===`xhigh`||apiEffort===`xxhigh`)continue;" +
  "let key=o.slug+`:`+apiEffort;if(seen.has(key))continue;seen.add(key);" +
  "let label=String(o.selectedLabel||o.title||o.slug),baseLabel=groupByKey.get(o.slug+`:`+apiEffort)||String(o.modelLabel||o.slug);" +
  "let variant=label&&label!==baseLabel?label:``,displayName=(variant?(label.toLowerCase().startsWith(baseLabel.toLowerCase())?label:baseLabel+` `+label):baseLabel).trim(),model=`chat:`+encodeURIComponent(o.slug)+`:`+encodeURIComponent(apiEffort);" +
  "let row={id:model,model,apiModel:o.slug,modelLabel:displayName,sliderLabel:displayName/* " +
  FORMAT_MARKER +
  " */,reasoningEffort:`none`,apiEffort,powerSettingIndex:rows.length,lane:o.lane||null};rows.push(row);/* " +
  LABEL_MARKER +
  " */" +
  "models.push({id:model,model,displayName,description:typeof o.description===`string`?o.description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`none`,description:displayName}],defaultReasoningEffort:`none`,isDefault:!1});" +
  "}" +
  "if(!rows.length)return e;" +
  "let defRow=rows.find(r=>r.apiModel===e.defaultModelSlug)||rows[0],defSlug=defRow.model;" +
  "for(let m of models)m.isDefault=m.model===defSlug;" +
  "let sig=JSON.stringify([defSlug,rows.map(r=>[r.model,r.apiModel,r.apiEffort,r.modelLabel])]);" +
  "let changed=globalThis.__cdrChatCatalogSignature!==sig;" +
  "globalThis.__cdrChatCatalog=e;globalThis.__cdrChatDefaultSlug=defSlug;globalThis.__cdrChatDefaultApiSlug=defRow.apiModel;" +
  "if(changed){globalThis.__cdrChatCatalogSignature=sig;globalThis.__cdrChatPowerRows=rows;globalThis.__cdrChatPickerModels=models;" +
  "try{window.dispatchEvent(new CustomEvent(`cdr-chat-models-change`,{detail:{count:rows.length,defaultModelSlug:defSlug}}))}catch{}}" +
  "return e;" +
  "}catch(err){try{console.error(`[cdr] CDRMergeChatModels`,err)}catch{}return e}}";

const OLD_LOAD_PREFIX =
  "(0,_k.useEffect)(()=>{/* " + MARKER54 + ":load */";
const NEW_LOAD =
  "(0,_k.useEffect)(()=>{/* " +
  MARKER55 +
  ":load */if(CDRMode!==`chat`)return;let alive=!0;" +
  "let onCh=()=>{if(alive)CDRSetChatTick(e=>e+1)};try{window.addEventListener(`cdr-chat-models-change`,onCh)}catch{}" +
  "(async()=>{try{let client=null;try{client=o.get(V_)}catch{}if(!client||typeof client.models!==`function`){try{client=globalThis.__cdrEnsureChatClient&&globalThis.__cdrEnsureChatClient()}catch{client=null}}if(!client||typeof client.models!==`function`)return;" +
  "let pending=globalThis.__cdrChatModelsLoadPromise;if(!pending){pending=Promise.resolve(client.models());globalThis.__cdrChatModelsLoadPromise=pending;pending.finally(()=>{setTimeout(()=>{if(globalThis.__cdrChatModelsLoadPromise===pending)globalThis.__cdrChatModelsLoadPromise=null},3e4)})}" +
  "await pending;if(!alive)return;CDRSetChatTick(e=>e+1);try{let rows=globalThis.__cdrChatPowerRows||[],hit=rows.find(r=>r.model===T);if(rows.length&&!hit){hit=rows.find(r=>r.model===globalThis.__cdrChatDefaultSlug)||rows[0];if(hit&&globalThis.__cdrChatLastAppliedSelection!==hit.model){globalThis.__cdrChatLastAppliedSelection=hit.model;setTimeout(()=>{try{if(alive)globalThis.__cdrLocalModeV4?.setMode(`chat`)}catch{}},50)}}}catch{}" +
  "}catch(err){try{console.error(`[cdr] chat models load`,err)}catch{}}})();" +
  "return()=>{alive=!1;try{window.removeEventListener(`cdr-chat-models-change`,onCh)}catch{}}},[CDRMode,o])";

const CHAT_SELECTOR_HELPER =
  "function CDRChatFlatSelector(){/* codex-rebuild:chat-models-v56:flat-selector */" +
  "let rows=Array.isArray(globalThis.__cdrChatPowerRows)?globalThis.__cdrChatPowerRows:[],read=()=>{try{return localStorage.getItem(`cdr-chat-model-selection`)||\"\"}catch{return\"\"}},[selected,setSelected]=(0,_k.useState)(read);" +
  "(0,_k.useEffect)(()=>{let sync=()=>setSelected(cur=>{let list=globalThis.__cdrChatPowerRows||[];return list.some(r=>r.model===cur)?cur:globalThis.__cdrChatDefaultSlug||list[0]?.model||``});try{window.addEventListener(`cdr-chat-models-change`,sync)}catch{}sync();return()=>{try{window.removeEventListener(`cdr-chat-models-change`,sync)}catch{}}},[]);" +
  "let value=rows.some(r=>r.model===selected)?selected:globalThis.__cdrChatDefaultSlug||rows[0]?.model||``;globalThis.__cdrChatSelectedModel=value;" +
  "(0,_k.useEffect)(()=>{if(!value)return;globalThis.__cdrChatSelectedModel=value;try{localStorage.setItem(`cdr-chat-model-selection`,value)}catch{}},[value]);" +
  "return(0,yk.jsx)(`select`,{value,onChange:e=>{let v=e.target.value;globalThis.__cdrChatSelectedModel=v;try{localStorage.setItem(`cdr-chat-model-selection`,v)}catch{}setSelected(v)},className:`max-w-52 cursor-pointer truncate bg-transparent text-sm text-token-text-secondary outline-none`,\"aria-label\":`Chat model`,children:rows.map(r=>(0,yk.jsx)(`option`,{value:r.model,children:r.modelLabel},r.model))})}";

function replaceLoadEffect(source) {
  const currentMarker = source.indexOf(MARKER55 + ":load");
  if (currentMarker >= 0 && source.slice(currentMarker, currentMarker + 1800).includes("__cdrLocalModeV4")) return source;
  let start = source.indexOf(OLD_LOAD_PREFIX);
  if (start < 0) start = source.indexOf("(0,_k.useEffect)(()=>{/* codex-rebuild:chat-models-v55:load */");
  if (start < 0) start = source.indexOf("(0,_k.useEffect)(()=>{/* codex-rebuild:chat-models-v56:load */");
  assert(start >= 0, "Missing prior load effect");
  const endNeedle = source.indexOf("},[CDRMode,o,w,T,S]);", start) >= 0
    ? "},[CDRMode,o,w,T,S]);"
    : "},[CDRMode,o]);";
  const end = source.indexOf(endNeedle, start);
  assert(end >= 0, "Missing v54 load dependencies");
  return source.slice(0, start) + NEW_LOAD + ";" + source.slice(end + endNeedle.length);
}

const EFFORT_GUARD_START =
  "const CDRUnknownEffortDescriptor/*" + MARKER54 + ":effort-guard*/=";

function stabilizeEffortDescriptorGuard(source) {
  if (source.includes("const CDRFallbackEffortDescriptors")) return source;
  if (source.includes(MARKER55 + ":effort-guard")) return source;
  const start = source.indexOf(EFFORT_GUARD_START);
  assert(start >= 0, "Missing v54 effort descriptor guard");
  const endNeedle = ";\nimport";
  const end = source.indexOf(endNeedle, start);
  assert(end >= 0, "Missing end of v54 effort descriptor guard");
  const guard =
    "const CDRFallbackEffortDescriptors/*" +
    MARKER55 +
    ":effort-guard*/={" +
    "none:{id:`codex-rebuild.reasoning.none`,defaultMessage:`Default`}," +
    "minimal:{id:`codex-rebuild.reasoning.minimal`,defaultMessage:`Minimal`}," +
    "low:{id:`codex-rebuild.reasoning.low`,defaultMessage:`Low`}," +
    "medium:{id:`codex-rebuild.reasoning.medium`,defaultMessage:`Medium`}," +
    "high:{id:`codex-rebuild.reasoning.high`,defaultMessage:`High`}," +
    "xhigh:{id:`codex-rebuild.reasoning.xhigh`,defaultMessage:`Extra high`}," +
    "max:{id:`codex-rebuild.reasoning.max`,defaultMessage:`Maximum`}," +
    "ultra:{id:`codex-rebuild.reasoning.ultra`,defaultMessage:`Ultra`}," +
    "standard:{id:`codex-rebuild.reasoning.standard`,defaultMessage:`Medium`}," +
    "extended:{id:`codex-rebuild.reasoning.extended`,defaultMessage:`High`}};" +
    "const CDRUnknownEffortDescriptor={id:`codex-rebuild.reasoning.unknown`,defaultMessage:`Unknown`};" +
    "const CDRRawEffortDescriptors=(typeof __CDRCbRaw===`object`||typeof __CDRCbRaw===`function`)&&__CDRCbRaw!==null?__CDRCbRaw:{};" +
    "const Cb=new Proxy({...CDRFallbackEffortDescriptors,...CDRRawEffortDescriptors},{get(t,k){if(typeof k!==`string`||k in t)return t[k];return CDRUnknownEffortDescriptor}})";
  return source.slice(0, start) + guard + source.slice(end);
}

const OLD_BRIDGE_START =
  "let model=(n&&(n.model||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model)))||globalThis.__cdrChatDefaultSlug||`auto`;";

function replaceBridge(source) {
  if (source.includes(MARKER55 + ":bridge-model")) {
    if (source.includes("globalThis.__cdrChatSelectedModel||")) return source;
    return replaceOnce(source,"let logicalModel=(n&&(n.model||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model)))||globalThis.__cdrChatDefaultSlug||`auto`;","let logicalModel=globalThis.__cdrChatSelectedModel||(()=>{try{return localStorage.getItem(`cdr-chat-model-selection`)}catch{return null}})()||(n&&(n.model||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model)))||globalThis.__cdrChatDefaultSlug||`auto`;","prefer flat Chat selection");
  }
  const start = source.indexOf(OLD_BRIDGE_START);
  assert(start >= 0, "Missing v54 bridge start");
  const endNeedle = "}catch{}";
  const remapStart = source.indexOf(
    "try{let rows=globalThis.__cdrChatPowerRows;if(Array.isArray(rows)&&rows.length&&!rows.some(r=>r.model===model))",
    start,
  );
  assert(remapStart >= 0, "Missing v54 bridge remap");
  const end = source.indexOf(endNeedle, remapStart);
  assert(end >= 0, "Missing v54 bridge remap end");

  const replacement =
    "let logicalModel=globalThis.__cdrChatSelectedModel||(()=>{try{return localStorage.getItem(`cdr-chat-model-selection`)}catch{return null}})()||(n&&(n.model||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model)))||globalThis.__cdrChatDefaultSlug||`auto`;" +
    "let effort=(n&&(n.effort||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.reasoning_effort)));" +
    "let model=logicalModel;try{let rows=globalThis.__cdrChatPowerRows||[],row=rows.find(r=>r.model===logicalModel)||rows.find(r=>r.apiModel===logicalModel&&(effort==null||r.apiEffort===effort))||rows.find(r=>r.model===globalThis.__cdrChatDefaultSlug)||rows[0];if(row){model=row.apiModel;effort=row.apiEffort}}catch{}" +
    "/* " +
    MARKER55 +
    ":bridge-model */if(effort===`none`||effort===`minimal`)effort=void 0;";

  return source.slice(0, start) + replacement + source.slice(end + endNeedle.length);
}

function patchChat(source) {
  const range = extractFunction(source, "function CDRMergeChatModels(");
  let end = range.end;
  const comment = source.slice(end, end + 100).match(/^\/\* codex-rebuild:[^*]+\*\//);
  if (comment) end += comment[0].length;
  return source.slice(0, range.start) + MERGE_HELPER + source.slice(end);
}

function flattenChatPicker(source) {
  if (!source.includes("chat-models-v56:flat-selector")) source = source.replace("let CDRRuntime=(function installLocalModeRuntime() {",CHAT_SELECTOR_HELPER+"let CDRRuntime=(function installLocalModeRuntime() {");
  source = source.replace("CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort))","CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>ye(CDRModel,CDREffort))");
  if (!source.includes("showReasoningEffortControls:CDRMode!==`chat`")) source = replaceOnce(source,"showReasoningEffortControls:!0","showReasoningEffortControls:CDRMode!==`chat`","hide Chat reasoning controls");
  if (!source.includes("onSelectReasoningEffort:CDRMode===`chat`")) source = replaceOnce(source,"onSelectReasoningEffort:e=>{ye(T,e)}","onSelectReasoningEffort:CDRMode===`chat`?void 0:e=>{ye(T,e)}","disable Chat reasoning handler");
  if (!source.includes("CDRMode===`chat`?null:(0,yk.jsx)(Jr")) source = replaceOnce(source,"(0,yk.jsx)(Jr,{collapse:`sm`,className:`shrink-0`,children:(0,yk.jsx)(X,{...Cb[W]})})","CDRMode===`chat`?null:(0,yk.jsx)(Jr,{collapse:`sm`,className:`shrink-0`,children:(0,yk.jsx)(X,{...Cb[W]})})","hide Chat trigger effort");
  const collaborationNeedle = "const collaborationForMode = (value, collaboration) => {\n    if (!collaboration || typeof collaboration !== \"object\") {";
  const collaborationFlat = "const collaborationForMode = (value, collaboration) => {\n    if (normalize(value) === \"chat\") return collaboration;/* codex-rebuild:chat-models-v56:preserve-selection */\n    if (!collaboration || typeof collaboration !== \"object\") {";
  if (!source.includes("chat-models-v56:preserve-selection")) {
    const count = source.split(collaborationNeedle).length - 1;
    assert(count === 2, `preserve Chat selection: expected 2 matches, found ${count}`);
    source = source.split(collaborationNeedle).join(collaborationFlat);
  }
  source = source.split("reasoningEffort:hit?.supportedReasoningEfforts?.[0]?.reasoningEffort||`medium`").join("reasoningEffort:hit?.supportedReasoningEfforts?.[0]?.reasoningEffort||`none`");
  if (!source.includes("CDRMode===`chat`?(0,yk.jsx)(CDRChatFlatSelector")) source = replaceOnce(source,"ee?null:(0,yk.jsxs)(yk.Fragment,{children:","ee?null:CDRMode===`chat`?(0,yk.jsx)(CDRChatFlatSelector,{}):(0,yk.jsxs)(yk.Fragment,{children:","render flat Chat selector");
  return source;
}

function verify(chat, settings, send) {
  assert(chat.includes(MARKER55 + ":merge"), "Stable merge missing");
  assert(chat.includes("__cdrChatCatalogSignature"), "Catalog dedupe missing");
  assert(chat.includes("apiEffort"), "API effort preservation missing");
  assert(chat.includes(FORMAT_MARKER), "Format-safe slider labels missing");
  assert(chat.includes(LABEL_MARKER), "Version-aware model labels missing");
  assert(settings.includes(MARKER55 + ":load"), "Stable load effect missing");
  assert(settings.includes("},[CDRMode,o])"), "Unstable load dependencies remain");
  assert(!settings.includes("},[CDRMode,o,w,T,S])"), "v54 feedback dependencies remain");
  assert(send.includes(MARKER55 + ":bridge-model"), "Bridge effort mapping missing");
  assert(send.includes("model=row.apiModel;effort=row.apiEffort"), "Bridge does not restore API model and effort");
  assert(settings.includes("showReasoningEffortControls:CDRMode!==`chat`"), "Chat reasoning controls remain enabled");
  assert(settings.includes("chat-models-v56:preserve-selection"), "Chat send selection is still overwritten");
  assert(settings.includes("=>ye(CDRModel,CDREffort)"), "Mode controller bypasses persistent model selection");
  assert(settings.includes("chat-models-v56:flat-selector"), "Flat Chat selector missing");
  assert(send.includes("globalThis.__cdrChatSelectedModel||"), "Send bridge does not prefer flat selector state");
  parseOk("chat", chat);
  parseOk("settings", settings);
  parseOk("send", send);
}

let chat = patchChat(fs.readFileSync(CHAT, "utf8"));
let settings = stabilizeEffortDescriptorGuard(
  flattenChatPicker(replaceLoadEffect(fs.readFileSync(SETTINGS, "utf8"))),
);
let send = replaceBridge(fs.readFileSync(SEND, "utf8"));
verify(chat, settings, send);

if (!process.argv.includes("--check")) {
  fs.writeFileSync(CHAT, chat);
  fs.writeFileSync(SETTINGS, settings);
  fs.writeFileSync(SEND, send);
}

const output = process.env.CDR_PACKED_ASAR
  ? path.resolve(process.env.CDR_PACKED_ASAR)
  : path.join(ROOT, "out", "app-chat-models-v56.asar");
if (process.argv.includes("--pack")) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  asar.createPackage(ASAR_ROOT, output).then(() => {
    console.log(`v56 packed ${output}`);
  });
} else {
  console.log(process.argv.includes("--check") ? "v56 check ok" : "v56 sources patched");
}
