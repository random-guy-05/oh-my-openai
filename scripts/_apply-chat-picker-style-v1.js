#!/usr/bin/env node
"use strict";
/**
 * chat-picker-style-v1 — Restyle Chat model selector to match Codex mode
 * (ghost composer trigger + oss label + mz dropdown + checkmark items).
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-picker-style-v1";
const monoName = fs
  .readdirSync(ASSETS)
  .find((f) => f.startsWith("app-initial-") && f.endsWith(".js"));
if (!monoName) throw new Error("app-initial not found");
const MONO = path.join(ASSETS, monoName);

function functionExtentByName(src, name) {
  const head = `function ${name}(`;
  const start = src.indexOf(head);
  if (start < 0) throw new Error(`${name} not found`);
  let p = start + head.length - 1,
    parens = 0;
  for (; p < src.length; p++) {
    if (src[p] === "(") parens++;
    else if (src[p] === ")") {
      parens--;
      if (parens === 0) break;
    }
  }
  let i = src.indexOf("{", p),
    depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`${name}: unbalanced`);
}
function replaceFn(src, name, next) {
  const e = functionExtentByName(src, name);
  return src.slice(0, e.start) + next + src.slice(e.end);
}

function main() {
  let mono = fs.readFileSync(MONO, "utf8");
  if (mono.includes(MARKER + ":flat-selector")) {
    console.log("[skip] picker style already applied");
    return;
  }

  // Detect React/JSX aliases from current flat selector / QMs
  const flatExt = functionExtentByName(mono, "CDRChatFlatSelector");
  const flatSample = mono.slice(flatExt.start, flatExt.end);
  const qmsExt = functionExtentByName(mono, "QMs");
  const qmsSample = mono.slice(qmsExt.start, qmsExt.end);
  const sample = flatSample + qmsSample;
  const react = sample.match(/\(0,([A-Za-z_$][\w$]*)\.(?:useRef|useEffect|useState)\)/);
  const jsx = sample.match(/\(0,([A-Za-z_$][\w$]*)\.(?:jsx|jsxs)\)/);
  if (!react || !jsx) throw new Error("React/JSX aliases not found");
  const R = react[1];
  const J = jsx[1];
  console.log(`[detect] React=${R} JSX=${J}`);

  // Sanity: native primitives must exist in module scope
  for (const name of ["mz", "Np", "oss", "$X", "Ym"]) {
    if (!mono.includes(`function ${name}(`) && !mono.includes(`,${name}=`) && !mono.includes(`${name}=e=>`)) {
      // Ym is assigned as ,Ym=e=>
      if (name === "Ym" && mono.includes("Ym=")) continue;
      throw new Error(`missing primitive ${name}`);
    }
  }

  const NEW = `function CDRChatFlatSelector(){/* ${MARKER}:flat-selector */
let[,setTick]=(0,${R}.useState)(0);
let[open,setOpen]=(0,${R}.useState)(!1);
let read=()=>{try{return localStorage.getItem('cdr-chat-model-selection')||''}catch{return''}};
let[selected,setSelected]=(0,${R}.useState)(read);
let[status,setStatus]=(0,${R}.useState)('idle');
(0,${R}.useEffect)(()=>{let sync=()=>setTick(v=>v+1);
try{window.addEventListener('cdr-chat-models-change',sync)}catch{}
try{window.addEventListener('cdr-local-mode-change',sync)}catch{}
sync();return()=>{try{window.removeEventListener('cdr-chat-models-change',sync)}catch{}try{window.removeEventListener('cdr-local-mode-change',sync)}catch{}}},[]);
(0,${R}.useEffect)(()=>{if(typeof CDRIsChatMode==='function'&&!CDRIsChatMode())return;let alive=!0;setStatus('loading');
(async()=>{try{if(typeof CDRLoadChatModels==='function')await CDRLoadChatModels();if(alive)setStatus('ready')}catch(err){if(alive)setStatus(globalThis.__cdrChatPowerRows&&globalThis.__cdrChatPowerRows.length?'ready':'error');try{console.error('[cdr] flat load',err)}catch{}}})();
return()=>{alive=!1}},[]);
let rows=(Array.isArray(globalThis.__cdrChatPowerRows)?globalThis.__cdrChatPowerRows:[]).filter(r=>r&&r.apiModel&&!(typeof CDRIsCodexModelSlug==='function'&&CDRIsCodexModelSlug(r.apiModel)));
if(!rows.length&&status!=='loading'&&typeof CDRChatFallbackRows==='function')rows=CDRChatFallbackRows();
let value=rows.some(r=>r.model===selected)?selected:(globalThis.__cdrChatDefaultSlug||(rows[0]&&rows[0].model)||'');
let hit=rows.find(r=>r.model===value);
globalThis.__cdrChatSelectedModel=value;if(hit)globalThis.__cdrChatDefaultApiSlug=hit.apiModel;
(0,${R}.useEffect)(()=>{if(!value)return;globalThis.__cdrChatSelectedModel=value;try{localStorage.setItem('cdr-chat-model-selection',value)}catch{};if(hit){try{globalThis.__cdrChatDefaultApiSlug=hit.apiModel}catch{}}},[value]);
let pick=r=>{if(!r)return;globalThis.__cdrChatSelectedModel=r.model;globalThis.__cdrChatDefaultApiSlug=r.apiModel;try{localStorage.setItem('cdr-chat-model-selection',r.model)}catch{}setSelected(r.model);setOpen(!1);try{window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{source:'picker-select',selectedModel:r.model}}))}catch{}};
if(!rows.length)return(0,${J}.jsx)(Np,{size:'composer',color:'ghost',className:'min-w-0',disabled:!0,'data-codex-intelligence-trigger':!0,children:(0,${J}.jsx)(oss,{categoryLabel:null,collapse:'none',icon:null,indicator:'none',selectedValue:status==='error'?'Chat models unavailable':'Loading…',selectedValueClassName:'max-w-40',foreground:'tertiary'})});
let trigger=(0,${J}.jsx)(Np,{'aria-expanded':!!open,'aria-haspopup':'menu',size:'composer',color:'ghost',className:'min-w-0','data-codex-intelligence-trigger':!0,'data-composer-navigation-target':'reasoning','data-state':open?'open':'closed',children:(0,${J}.jsx)(oss,{categoryLabel:null,collapse:'none',icon:null,indicator:'none',selectedValue:(0,${J}.jsx)('span',{className:'flex max-w-40 min-w-0 items-center gap-1.5',children:(0,${J}.jsx)($X,{model:hit&&hit.apiModel,displayName:(hit&&(hit.modelLabel||hit.sliderLabel))||value,stripGptPrefix:!0})}),selectedValueClassName:'max-w-40',foreground:'tertiary'})});
let items=(0,${J}.jsx)('div',{className:'vertical-scroll-fade-mask flex max-h-[250px] flex-col overflow-y-auto','data-model-picker-model-row':!0,children:rows.map(r=>{let sel=r.model===value;return(0,${J}.jsx)(yz.Item,{'data-model-selected':sel?'true':void 0,RightIcon:sel?Ym:void 0,onSelect:()=>pick(r),children:(0,${J}.jsx)($X,{model:r.apiModel,displayName:r.modelLabel||r.sliderLabel||r.apiModel,stripGptPrefix:!0})},r.model)})});
return(0,${J}.jsx)(mz,{open:!!open,onOpenChange:e=>setOpen(!!e),align:'end',contentWidth:'menuNarrow',contentClassName:'w-56',triggerButton:trigger,children:items})
}`;

  mono = replaceFn(mono, "CDRChatFlatSelector", NEW);
  console.log("[ok] CDRChatFlatSelector → Codex-style picker");

  if (!mono.includes(MARKER + ":applied")) {
    mono = mono.replace(
      "async function CDRStickyChatSend(",
      `/* ${MARKER}:applied */async function CDRStickyChatSend(`,
    );
  }

  try {
    acorn.parse(mono, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowReturnOutsideFunction: true,
    });
  } catch (e) {
    throw new Error("parse failed: " + e.message);
  }
  fs.writeFileSync(MONO, mono);
  console.log("[ok] written");
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("[fail]", e.message);
    process.exit(1);
  }
}
module.exports = { MARKER };
