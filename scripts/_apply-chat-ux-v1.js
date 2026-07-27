#!/usr/bin/env node
"use strict";

/**
 * Chat UX hotfix for 26.721 monolith:
 * 1. Flat Chat model selector fed by live ChatGPT catalog when mode === chat
 * 2. Never fall through to Codex send while in Chat mode (Codex quota burn)
 * 3. Load ChatGPT client.models() when entering Chat mode
 */

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-ux-v1";

const monoName = fs
  .readdirSync(ASSETS)
  .find((f) => f.startsWith("app-initial-") && f.endsWith(".js"));
if (!monoName) throw new Error("app-initial not found");
const MONO = path.join(ASSETS, monoName);

function functionExtentByName(src, name) {
  const head = `function ${name}(`;
  const start = src.indexOf(head);
  if (start < 0) throw new Error(`${name} not found`);
  let p = start + head.length - 1;
  let parens = 0;
  for (; p < src.length; p++) {
    if (src[p] === "(") parens++;
    else if (src[p] === ")") {
      parens--;
      if (parens === 0) break;
    }
  }
  let i = src.indexOf("{", p);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`${name}: unbalanced`);
}

function replaceOne(src, from, to, label) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: expected 1, found ${n}`);
  return src.replace(from, to);
}

function main() {
  let mono = fs.readFileSync(MONO, "utf8");
  if (mono.includes(MARKER + ":applied")) {
    console.log("[skip] chat-ux-v1 already applied");
    return;
  }

  // 1) Harden send hook
  const OLD_HOOK =
    "let v=CH(),y=l.trim();{/* codex-rebuild:all-features-26721-v1:send-hook */try{if(globalThis.__cdrLocalModeV4&&typeof globalThis.__cdrLocalModeV4.mode==='function'&&globalThis.__cdrLocalModeV4.mode()==='chat'){let _cdrRes=await CDRStickyChatSend(e,n,{input:l,model:a,thinkingEffort:f,attachments:t});if(_cdrRes)return{conversationId:n,serverConversationId:null,streamRequestId:null};}}catch(_cdrErr){try{console.error('[cdr] send hook error',_cdrErr)}catch{}}}";

  const NEW_HOOK =
    "let v=CH(),y=l.trim();{/* " +
    MARKER +
    ":send-hook */try{let _cdrChat=false;try{_cdrChat=!!(globalThis.__cdrLocalModeV4&&typeof globalThis.__cdrLocalModeV4.mode==='function'&&globalThis.__cdrLocalModeV4.mode()==='chat')}catch{}" +
    "try{_cdrChat=_cdrChat||(typeof document!=='undefined'&&document.documentElement&&document.documentElement.getAttribute('data-codex-product-mode')==='chat')}catch{}" +
    "if(_cdrChat){try{await CDRStickyChatSend(e,n,{input:l,model:(globalThis.__cdrChatDefaultApiSlug||globalThis.__cdrChatSelectedModel||'auto'),thinkingEffort:void 0,attachments:t})}catch(_cdrErr){try{console.error('[cdr] send hook error',_cdrErr)}catch{}}" +
    "return{conversationId:n,serverConversationId:null,streamRequestId:null}}}catch(_cdrOuter){try{console.error('[cdr] send hook outer',_cdrOuter)}catch{}}}";

  if (mono.includes(MARKER + ":send-hook")) {
    console.log("[skip] send hook already hardened");
  } else {
    mono = replaceOne(mono, OLD_HOOK, NEW_HOOK, "harden chat send hook");
    console.log("[ok] chat send no longer falls through to Codex");
  }

  // 2) Chat flat selector component (module scope, before QMs)
  if (!mono.includes("function CDRChatFlatSelector(")) {
    const qmsStart = mono.indexOf("function QMs(");
    if (qmsStart < 0) throw new Error("QMs not found");
    // Detect aliases from inside QMs body
    const extent = functionExtentByName(mono, "QMs");
    const pickerSample = mono.slice(extent.start, extent.end);
    const react = pickerSample.match(/\(0,([A-Za-z_$][\w$]*)\.(?:useRef|useEffect|useState)\)/);
    const jsx = pickerSample.match(/\(0,([A-Za-z_$][\w$]*)\.(?:jsx|jsxs)\)/);
    if (!react || !jsx) throw new Error("QMs: React/JSX aliases not found");
    const R = react[1];
    const J = jsx[1];
    console.log(`[detect] QMs React=${R} JSX=${J}`);

    const SELECTOR =
      `function CDRChatFlatSelector(){/* ${MARKER}:flat-selector */` +
      `let rows=Array.isArray(globalThis.__cdrChatPowerRows)?globalThis.__cdrChatPowerRows:[];` +
      `let read=()=>{try{return localStorage.getItem('cdr-chat-model-selection')||''}catch{return''}};` +
      `let[,setTick]=(0,${R}.useState)(0);` +
      `let[selected,setSelected]=(0,${R}.useState)(read);` +
      `(0,${R}.useEffect)(()=>{let sync=()=>{setTick(v=>v+1);setSelected(cur=>{let list=globalThis.__cdrChatPowerRows||[];return list.some(r=>r.model===cur)?cur:(globalThis.__cdrChatDefaultSlug||(list[0]&&list[0].model)||'')});};` +
      `try{window.addEventListener('cdr-chat-models-change',sync)}catch{}sync();` +
      `return()=>{try{window.removeEventListener('cdr-chat-models-change',sync)}catch{}}},[]);` +
      `let value=rows.some(r=>r.model===selected)?selected:(globalThis.__cdrChatDefaultSlug||(rows[0]&&rows[0].model)||'');` +
      `globalThis.__cdrChatSelectedModel=value;` +
      `(0,${R}.useEffect)(()=>{if(!value)return;globalThis.__cdrChatSelectedModel=value;try{localStorage.setItem('cdr-chat-model-selection',value)}catch{}},[value]);` +
      `if(!rows.length)return(0,${J}.jsx)('span',{className:'ml-1 text-xs text-token-text-tertiary',children:globalThis.__cdrChatModelsLoadError?'Chat models unavailable':'Loading Chat models…'});` +
      `return(0,${J}.jsx)('select',{value,onChange:e=>{let v=e.target.value;globalThis.__cdrChatSelectedModel=v;try{localStorage.setItem('cdr-chat-model-selection',v)}catch{}setSelected(v)},` +
      `className:'max-w-56 cursor-pointer truncate bg-transparent text-sm text-token-text-secondary outline-none','aria-label':'Chat model',` +
      `children:rows.map(r=>(0,${J}.jsx)('option',{value:r.model,children:r.modelLabel||r.apiModel||r.model},r.model))})}` +
      `\n`;

    mono = mono.slice(0, qmsStart) + SELECTOR + mono.slice(qmsStart);
    console.log("[ok] CDRChatFlatSelector declared");
  }

  // 3) Patch QMs body: mode state, catalog load, flat render
  const extent = functionExtentByName(mono, "QMs");
  let picker = mono.slice(extent.start, extent.end);
  const react = picker.match(/\(0,([A-Za-z_$][\w$]*)\.(?:useRef|useEffect|useState)\)/);
  const jsx = picker.match(/\(0,([A-Za-z_$][\w$]*)\.(?:jsx|jsxs)\)/);
  if (!react || !jsx) throw new Error("QMs aliases missing after selector insert");
  const R = react[1];
  const J = jsx[1];

  if (!picker.includes(MARKER + ":mode-state")) {
    const runtimeEnd = picker.indexOf("})();");
    if (runtimeEnd < 0) throw new Error("QMs: CDRRuntime IIFE terminator not found");
    const insertAt = runtimeEnd + "})();".length;
    const modeState =
      `let[CDRMode,CDRSetMode]=(0,${R}.useState)(()=>CDRRuntime.mode('codex'));` +
      `(0,${R}.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);/* ${MARKER}:mode-state */`;
    picker = picker.slice(0, insertAt) + modeState + picker.slice(insertAt);
    console.log("[ok] CDRMode subscribed inside QMs");
  }

  if (!picker.includes(MARKER + ":load")) {
    const loadEffect =
      `(0,${R}.useEffect)(()=>{/* ${MARKER}:load2 */` +
      `if(CDRMode!=='chat')return;` +
      `let alive=!0;` +
      `(async()=>{try{` +
      `let client=null;` +
      `try{if(typeof MH!=='undefined'&&i&&typeof i.get==='function')client=i.get(MH)}catch{}` +
      `if(!client||typeof client.models!=='function'){try{client=globalThis.__cdrChatClient}catch{}}` +
      `if(!client||typeof client.models!=='function'){try{client=globalThis.__cdrEnsureChatClient&&globalThis.__cdrEnsureChatClient()}catch{client=null}}` +
      `if(!client||typeof client.models!=='function'){try{console.warn('[cdr] chat models: no ChatGPT client')}catch{}return}` +
      `globalThis.__cdrChatClient=client;` +
      `await client.models();try{globalThis.__cdrChatModelsLoadError=null}catch{};` +
      `if(!alive)return;` +
      `try{window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{source:'load2'}}))}catch{}` +
      `}catch(err){try{globalThis.__cdrChatModelsLoadError=String(err&&err.message||err);console.error('[cdr] chat models load',err)}catch{}}})();` +
      `return()=>{alive=!1}` +
      `},[CDRMode,i]);`;

    const syncMark = "/* codex-rebuild:local-canonical-model-picker-v5:sync */";
    if (picker.includes(syncMark)) {
      picker = picker.replace(syncMark, syncMark + loadEffect);
    } else if (picker.includes("CDRRuntime.registerModelController(")) {
      picker = picker.replace(
        /CDRRuntime\.registerModelController\([\s\S]*?\),\[[^\]]+\]\);/,
        (m) => m + loadEffect,
      );
    } else {
      throw new Error("QMs missing registerModelController sync");
    }
    console.log("[ok] chat catalog loader injected");
  }

  if (!picker.includes(MARKER + ":flat-render")) {
    // 26.721 QMs: F is the loading gate; native picker is EQ.Fragment > CMs.
    const alt = picker.match(
      /F\?null:\(0,([A-Za-z_$][\w$]*)\.jsx\)\(\1\.Fragment,\{children:/,
    );
    if (!alt) {
      const alt2 = picker.match(
        /F\?null:\(0,([A-Za-z_$][\w$]*)\.jsx\)\(([A-Za-z_$][\w$]*)\.Fragment,\{children:/,
      );
      if (!alt2) throw new Error("QMs: F?null Fragment anchor not found");
      picker = picker.replace(
        alt2[0],
        `F?null:CDRMode==='chat'?(0,${alt2[1]}.jsx)(CDRChatFlatSelector,{/* ${MARKER}:flat-render */}):(0,${alt2[1]}.jsx)(${alt2[2]}.Fragment,{children:`,
      );
    } else {
      picker = picker.replace(
        alt[0],
        `F?null:CDRMode==='chat'?(0,${alt[1]}.jsx)(CDRChatFlatSelector,{/* ${MARKER}:flat-render */}):(0,${alt[1]}.jsx)(${alt[1]}.Fragment,{children:`,
      );
    }
    console.log("[ok] flat selector render branch added");
  }

  const extent2 = functionExtentByName(mono, "QMs");
  mono = mono.slice(0, extent2.start) + picker + mono.slice(extent2.end);

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
    throw new Error(`monolith no longer parses: ${e.message}`);
  }
  console.log("[ok] monolith parses");

  if (process.argv.includes("--check")) {
    console.log("[ok] chat-ux-v1 check only");
  } else {
    fs.writeFileSync(MONO, mono);
    console.log("[ok] chat-ux-v1 written");
  }
}

if (require.main === module) main();
module.exports = { MARKER };
