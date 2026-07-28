#!/usr/bin/env node
"use strict";
/**
 * chat-real-v2 — Make Chat mode actually use ChatGPT models + quota.
 *
 * Upgrades an already-patched 26.721 monolith in place:
 * 1. CDRIsChatMode() — reliable runtime mode gate
 * 2. CDRMergeChatModels — use the ChatGPT Web response as the source of truth
 * 3. CDRChatFlatSelector v2 — self-loads catalog, never shows Codex picker
 * 4. QMs render — gate on CDRIsChatMode(), not flaky React CDRMode
 * 5. Register __cdrEnsureChatClient from QMs jotai store (i.get(MH))
 * 6. Sticky send already refuses Codex models; keep that + ensure api slug
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-real-v2";
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

function replaceFn(src, name, newSrc) {
  const e = functionExtentByName(src, name);
  return src.slice(0, e.start) + newSrc + src.slice(e.end);
}

function parseOrThrow(src, label) {
  try {
    acorn.parse(src, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowReturnOutsideFunction: true,
    });
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
}

function main() {
  let mono = fs.readFileSync(MONO, "utf8");
  if (mono.includes(MARKER + ":applied")) {
    console.log("[skip] chat-real-v2 already applied");
    return;
  }

  // Detect React/JSX aliases from QMs
  const qms = functionExtentByName(mono, "QMs");
  const qmsBody = mono.slice(qms.start, qms.end);
  const react = qmsBody.match(
    /\(0,([A-Za-z_$][\w$]*)\.(?:useRef|useEffect|useState)\)/,
  );
  const jsx = qmsBody.match(/\(0,([A-Za-z_$][\w$]*)\.(?:jsx|jsxs)\)/);
  if (!react || !jsx) throw new Error("QMs React/JSX aliases not found");
  const R = react[1];
  const J = jsx[1];
  console.log(`[detect] React=${R} JSX=${J}`);

  // ── 1. CDRIsChatMode + isCodexChatSlug helpers (module scope) ─────────
  if (!mono.includes("function CDRIsChatMode(")) {
    const anchor = mono.indexOf("function CDRChatFlatSelector(");
    if (anchor < 0) throw new Error("CDRChatFlatSelector missing — run chat-ux first");
    const helpers =
      `function CDRIsCodexModelSlug(m){/* ${MARKER}:codex-slug */let s=String(m||'').toLowerCase();if(!s)return!1;return/(?:^|[-_])codex(?:$|[-_])/.test(s)}` +
      `function CDRIsChatMode(){/* ${MARKER}:is-chat */try{if(globalThis.__cdrLocalModeV4&&typeof globalThis.__cdrLocalModeV4.mode==='function'&&globalThis.__cdrLocalModeV4.mode()==='chat')return!0}catch{}try{if(typeof document!=='undefined'&&document.documentElement&&document.documentElement.getAttribute('data-codex-product-mode')==='chat')return!0}catch{}try{return String(localStorage.getItem('cdr-product-mode')||'').replace(/^["']|["']$/g,'')==='chat'}catch{return!1}}` +
      `function CDRChatFallbackRows(){/* ${MARKER}:fallback-rows */` +
      `return[` +
      `{id:'chat:auto:none',model:'chat:auto:none',apiModel:'auto',modelLabel:'Auto',sliderLabel:'Auto',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:0,lane:'instant'}` +
      `]}` +
      `async function CDRLoadChatModels(client){/* ${MARKER}:load-fn */` +
      `try{if(!client||typeof client.models!=='function'){client=globalThis.__cdrChatClient}if(!client||typeof client.models!=='function'){client=globalThis.__cdrEnsureChatClient&&globalThis.__cdrEnsureChatClient()}if(!client||typeof client.models!=='function')throw new Error('no ChatGPT client');globalThis.__cdrChatClient=client;await client.models();` +
      `let rows=Array.isArray(globalThis.__cdrChatPowerRows)?globalThis.__cdrChatPowerRows:[];` +
      `rows=rows.filter(r=>r&&r.apiModel&&!CDRIsCodexModelSlug(r.apiModel));` +
      `if(!rows.length){rows=CDRChatFallbackRows();globalThis.__cdrChatPowerRows=rows;globalThis.__cdrChatDefaultSlug=rows[0].model;globalThis.__cdrChatDefaultApiSlug=rows[0].apiModel;globalThis.__cdrChatSelectedModel=rows[0].model;try{window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{source:'fallback'}}))}catch{}}` +
      `try{globalThis.__cdrChatModelsLoadError=null}catch{};return rows;` +
      `}catch(err){try{globalThis.__cdrChatModelsLoadError=String(err&&err.message||err)}catch{};` +
      `if(!(globalThis.__cdrChatPowerRows&&globalThis.__cdrChatPowerRows.length)){let rows=CDRChatFallbackRows();globalThis.__cdrChatPowerRows=rows;globalThis.__cdrChatDefaultSlug=rows[0].model;globalThis.__cdrChatDefaultApiSlug=rows[0].apiModel;try{window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{source:'fallback-error'}}))}catch{}}` +
      `throw err}}` +
      `\n`;
    mono = mono.slice(0, anchor) + helpers + mono.slice(anchor);
    console.log("[ok] helpers installed");
  }

  // ── 2. Replace flat selector with self-loading v2 ────────────────────
  const NEW_FLAT =
    `function CDRChatFlatSelector(){/* ${MARKER}:flat-selector */` +
    `let[,setTick]=(0,${R}.useState)(0);` +
    `let read=()=>{try{return localStorage.getItem('cdr-chat-model-selection')||''}catch{return''}};` +
    `let[selected,setSelected]=(0,${R}.useState)(read);` +
    `let[status,setStatus]=(0,${R}.useState)('idle');` +
    `(0,${R}.useEffect)(()=>{let sync=()=>setTick(v=>v+1);` +
    `try{window.addEventListener('cdr-chat-models-change',sync)}catch{}` +
    `try{window.addEventListener('cdr-local-mode-change',sync)}catch{}` +
    `sync();return()=>{try{window.removeEventListener('cdr-chat-models-change',sync)}catch{}try{window.removeEventListener('cdr-local-mode-change',sync)}catch{}}},[]);` +
    `(0,${R}.useEffect)(()=>{if(!CDRIsChatMode())return;let alive=!0;setStatus('loading');` +
    `(async()=>{try{await CDRLoadChatModels();if(alive)setStatus('ready')}catch(err){if(alive)setStatus(globalThis.__cdrChatPowerRows&&globalThis.__cdrChatPowerRows.length?'ready':'error');try{console.error('[cdr] flat load',err)}catch{}}})();` +
    `return()=>{alive=!1}},[CDRIsChatMode()]);` +
    `let rows=(Array.isArray(globalThis.__cdrChatPowerRows)?globalThis.__cdrChatPowerRows:[]).filter(r=>r&&r.apiModel&&!CDRIsCodexModelSlug(r.apiModel));` +
    `if(!rows.length&&status!=='loading')rows=CDRChatFallbackRows();` +
    `let value=rows.some(r=>r.model===selected)?selected:(globalThis.__cdrChatDefaultSlug||(rows[0]&&rows[0].model)||'');` +
    `let api=rows.find(r=>r.model===value);` +
    `globalThis.__cdrChatSelectedModel=value;if(api)globalThis.__cdrChatDefaultApiSlug=api.apiModel;` +
    `(0,${R}.useEffect)(()=>{if(!value)return;globalThis.__cdrChatSelectedModel=value;try{localStorage.setItem('cdr-chat-model-selection',value)}catch{};if(api){try{globalThis.__cdrChatDefaultApiSlug=api.apiModel}catch{}}},[value]);` +
    `if(!rows.length)return(0,${J}.jsx)('span',{className:'ml-1 text-xs text-token-text-tertiary',children:status==='error'?'Chat models unavailable':'Loading Chat models…'});` +
    `return(0,${J}.jsx)('select',{value,onChange:e=>{let v=e.target.value;let hit=rows.find(r=>r.model===v);globalThis.__cdrChatSelectedModel=v;if(hit)globalThis.__cdrChatDefaultApiSlug=hit.apiModel;try{localStorage.setItem('cdr-chat-model-selection',v)}catch{}setSelected(v)},` +
    `className:'max-w-56 cursor-pointer truncate bg-transparent text-sm text-token-text-secondary outline-none','aria-label':'Chat model',` +
    `children:rows.map(r=>(0,${J}.jsx)('option',{value:r.model,children:r.modelLabel||r.apiModel||r.model},r.model))})}`;

  mono = replaceFn(mono, "CDRChatFlatSelector", NEW_FLAT);
  console.log("[ok] CDRChatFlatSelector → v2");

  // ── 3. Gate render on CDRIsChatMode() (not React CDRMode) ────────────
  const OLD_BRANCH =
    `F?null:CDRMode==='chat'?(0,EQ.jsx)(CDRChatFlatSelector,{/* codex-rebuild:chat-ux-v1:flat-render */}):(0,EQ.jsx)(EQ.Fragment,{children:`;
  const NEW_BRANCH =
    `F?null:CDRIsChatMode()?(0,EQ.jsx)(CDRChatFlatSelector,{/* ${MARKER}:flat-render */}):(0,EQ.jsx)(EQ.Fragment,{children:`;
  if (mono.includes(OLD_BRANCH)) {
    mono = mono.replace(OLD_BRANCH, NEW_BRANCH);
    console.log("[ok] flat-render gated on CDRIsChatMode()");
  } else if (mono.includes(`${MARKER}:flat-render`)) {
    console.log("[skip] flat-render already v2");
  } else {
    // Fuzzy: any CDRMode==='chat'? ... CDRChatFlatSelector
    const re =
      /F\?null:CDRMode==='chat'\?\(0,([A-Za-z_$][\w$]*)\.jsx\)\(CDRChatFlatSelector,\{\/\* codex-rebuild:chat-ux-v1:flat-render \*\/\}\):\(0,\1\.jsx\)\(\1\.Fragment,\{children:/;
    if (re.test(mono)) {
      mono = mono.replace(
        re,
        `F?null:CDRIsChatMode()?(0,$1.jsx)(CDRChatFlatSelector,{/* ${MARKER}:flat-render */}):(0,$1.jsx)($1.Fragment,{children:`,
      );
      console.log("[ok] flat-render gated (fuzzy)");
    } else {
      throw new Error("flat-render branch not found for upgrade");
    }
  }

  // ── 4. Register ensure-client from QMs store + always-on load ─────────
  const ensureEffect =
    `(0,${R}.useEffect)(()=>{/* ${MARKER}:ensure-client */` +
    `try{if(typeof MH!=='undefined'&&i&&typeof i.get==='function'){globalThis.__cdrEnsureChatClient=()=>{try{return i.get(MH)}catch{return null}};try{globalThis.__cdrChatClient=i.get(MH)}catch{}}}catch{}` +
    `if(CDRIsChatMode()){(async()=>{try{await CDRLoadChatModels()}catch(err){try{console.error('[cdr] ensure load',err)}catch{}}})()}` +
    `let onMode=()=>{if(CDRIsChatMode()){(async()=>{try{await CDRLoadChatModels()}catch{}})()}};` +
    `try{window.addEventListener('cdr-local-mode-change',onMode)}catch{}` +
    `return()=>{try{window.removeEventListener('cdr-local-mode-change',onMode)}catch{}}` +
    `},[i]);`;

  if (!mono.includes(MARKER + ":ensure-client")) {
    const syncMark = "/* codex-rebuild:local-canonical-model-picker-v5:sync */";
    if (mono.includes(syncMark)) {
      mono = mono.replace(syncMark, syncMark + ensureEffect);
      console.log("[ok] ensure-client effect injected");
    } else {
      throw new Error("sync marker missing for ensure-client inject");
    }
  }

  // ── 5. Harden CDRMergeChatModels — strip Codex slugs ─────────────────
  const mergeExt = functionExtentByName(mono, "CDRMergeChatModels");
  let merge = mono.slice(mergeExt.start, mergeExt.end);
  if (!merge.includes(MARKER + ":filter")) {
    // After building each row, skip Codex; after loop if empty use fallback
    if (!merge.includes("rows.push({id:modelId")) {
      throw new Error("merge rows.push site missing");
    }
    merge = merge.replace(
      "rows.push({id:modelId,model:modelId,apiModel:option.slug,modelLabel:displayName,sliderLabel:displayName,reasoningEffort:'none',apiEffort,powerSettingIndex:rows.length,lane:option.lane||null});",
      `if(CDRIsCodexModelSlug(option.slug)||CDRIsCodexModelSlug(displayName)||CDRIsCodexModelSlug(rawTitle))continue;/* ${MARKER}:filter */rows.push({id:modelId,model:modelId,apiModel:option.slug,modelLabel:displayName,sliderLabel:displayName,reasoningEffort:'none',apiEffort,powerSettingIndex:rows.length,lane:option.lane||null});`,
    );
    merge = merge.replace(
      "if(!rows.length)return result;",
      `if(!rows.length){try{let fb=CDRChatFallbackRows();globalThis.__cdrChatPowerRows=fb;globalThis.__cdrChatDefaultSlug=fb[0].model;globalThis.__cdrChatDefaultApiSlug=fb[0].apiModel;globalThis.__cdrChatSelectedModel=fb[0].model;window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{source:'merge-fallback'}}))}catch{}return result;}/* ${MARKER}:empty-fallback */`,
    );
    mono = mono.slice(0, mergeExt.start) + merge + mono.slice(mergeExt.end);
    console.log("[ok] CDRMergeChatModels filters Codex models");
  }

  // ── 6. Sticky send: resolve apiModel from selection, never Codex ──────
  // Prefer upgrading existing isCodexModel block if present; else inject.
  if (!mono.includes(MARKER + ":send-model")) {
    // After isCodexModel refusal block, ensure we use api slug not chat: id
    const needle =
      "if(isCodexModel(model)){upsert({role:'assistant',text:'[Chat] Refusing to send with a Codex model ('+model+'). Wait for Chat models to load, then retry.',source:'chat-error'});return!0}";
    if (mono.includes(needle)) {
      mono = mono.replace(
        needle,
        needle +
          `/* ${MARKER}:send-model */if(typeof model==='string'&&model.indexOf('chat:')===0){let hit=(globalThis.__cdrChatPowerRows||[]).find(r=>r.model===model);model=hit&&hit.apiModel?hit.apiModel:(globalThis.__cdrChatDefaultApiSlug||'auto')}`,
      );
      console.log("[ok] sticky send resolves chat: ids to apiModel");
    } else {
      console.log("[warn] sticky isCodex block not found — prior quota fix may differ");
    }
  }

  // ── 7. Skip registerModelController apply when entering chat ─────────
  // Prevents Sol/Terra/Luna from being pushed into the native picker while
  // Chat is active (native picker is hidden, but composer model `a` was
  // still getting Codex ids).
  const OLD_APPLY =
    "let CDRApply=presetSettings[next];if(next===`chat`){try{let slug=globalThis.__cdrChatDefaultSlug||globalThis.__cdrChatPickerModels?.[0]?.model;if(slug){let hit=(globalThis.__cdrChatPickerModels||[]).find(e=>e.model===slug);CDRApply={model:slug,reasoningEffort:hit?.supportedReasoningEfforts?.[0]?.reasoningEffort||`medium`}}}catch{}}const result = controller(CDRApply);";
  // More recent hardened form from quota fix — match loosely
  if (mono.includes("modelControllers)) {") || mono.includes("for (const controller of modelControllers)")) {
    // Replace controller invocation to no-op on chat
    const re =
      /for \(const controller of modelControllers\) \{\s*try \{\s*let CDRApply=presetSettings\[next\];if\(next===`chat`\)\{[\s\S]*?\}const result = controller\(CDRApply\);/;
    if (re.test(mono)) {
      mono = mono.replace(
        re,
        `for (const controller of modelControllers) { try { if(next===\`chat\`)continue;/* ${MARKER}:skip-native-chat */let CDRApply=presetSettings[next];const result = controller(CDRApply);`,
      );
      console.log("[ok] setMode skips native picker apply in chat");
    } else {
      // Try the one-line injected form inside RUNTIME_SOURCE copies
      const oneLine =
        /let CDRApply=presetSettings\[next\];if\(next===`chat`\)\{try\{[\s\S]*?\}catch\{[^}]*\}\}const result = controller\(CDRApply\);/;
      let n = 0;
      mono = mono.replace(oneLine, () => {
        n++;
        return `if(next===\`chat\`)continue;/* ${MARKER}:skip-native-chat */let CDRApply=presetSettings[next];const result = controller(CDRApply);`;
      });
      if (n) console.log(`[ok] setMode skip-native-chat x${n}`);
      else console.log("[warn] could not patch setMode controller loop");
    }
  }

  // Marker
  if (!mono.includes(MARKER + ":applied")) {
    mono = mono.replace(
      "/* codex-rebuild:chat-ux-v1:applied */async function CDRStickyChatSend(",
      `/* codex-rebuild:chat-ux-v1:applied *//* ${MARKER}:applied */async function CDRStickyChatSend(`,
    );
    if (!mono.includes(MARKER + ":applied")) {
      mono = mono.replace(
        "async function CDRStickyChatSend(",
        `/* ${MARKER}:applied */async function CDRStickyChatSend(`,
      );
    }
  }

  parseOrThrow(mono, "monolith");
  console.log("[ok] parses");

  if (process.argv.includes("--check")) {
    console.log("[ok] check only");
    return;
  }
  fs.writeFileSync(MONO, mono);
  console.log("[ok] written", path.relative(ROOT, MONO));
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
