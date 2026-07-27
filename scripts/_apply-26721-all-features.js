#!/usr/bin/env node
"use strict";

/**
 * Unified feature patch for ChatGPT 26.721 base.
 *
 * Ports ALL custom features that were lost during the 26.721 rebase:
 * 1. CDRStickyChatSend — Chat mode send bridge (routes through ChatGPT API)
 * 2. CDRTaskUsageBadge — Cumulative task-level usage display (5h/7d + tokens)
 * 3. CDRTurnUsageBadge — Per-turn token usage display beside copy/fork
 * 4. Error boundary instrumentation — Stash errors to localStorage
 * 5. CDRMergeChatModels — Expose live ChatGPT catalog as picker entries
 * 6. Usage runtime — Install __cdrUsageV1.summary() for badge data
 *
 * 26.721 key variable mappings (from 26.715):
 *   Monolith file: app-initial-BTphDPeq.js (was: many separate files)
 *   Send function: dynamically detected (was Nka in 26.715/26.721.31836, Pka in 26.721.41059)
 *   Action row: u6c(e) with {threadId:i, turnId:a}, JSX alias L3
 *   React hooks: g6c (React import, has useState/useEffect/useRef)
 *   Model catalog: P_a(await this.request.getModelsResponse())
 *   Error boundary: Lk class with Hf.error('error boundary',...) + this.setState
 *   App-main fallback: fallback:(0,G.jsx)(r,{})
 *   Existing CDR infra: CDRRuntime, CDRSetMode, CDRMode, __cdrLocalModeV4, __cdrUsageV1
 */

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");

// Find the current app-initial monolith and app-main bundles dynamically.
// Webpack chunk hashes change between upstream builds (e.g. 26.721.30844 vs 26.721.31836).
function findAsset(prefix) {
  const files = fs.readdirSync(ASSETS);
  const name = files.find(f => f.startsWith(prefix) && f.endsWith(".js"));
  if (!name) throw new Error(`Could not find asset starting with "${prefix}" in ${ASSETS}`);
  return path.join(ASSETS, name);
}
const MONO = findAsset("app-initial-");
const APP_MAIN = findAsset("app-main-");
const MARKER = "codex-rebuild:all-features-26721-v1";

// Find the local-conversation-thread file dynamically
function findThreadFile() {
  const files = fs.readdirSync(ASSETS);
  const name = files.find(f => f.includes("local-conversation-thread") && f.endsWith(".js"));
  return name ? path.join(ASSETS, name) : null;
}

// ─── Helpers ───

function assert(c, m) { if (!c) throw new Error(m); }

function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1 match, found ${n}`);
  return src.replace(from, to);
}

function tryReplace(src, from, to, label) {
  if (src.includes(from)) {
    const n = src.split(from).length - 1;
    if (n === 1) return src.replace(from, to);
    console.log(`[warn] ${label}: expected 1 match, found ${n}, skipping`);
    return src;
  }
  console.log(`[warn] ${label}: anchor not found, skipping`);
  return src;
}

function parseOk(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
}

// Find the minified alias that exposes both React hooks and JSX in this build.
// Webpack/Rolldown minified names shift between upstream builds, so we must
// detect them at patch time rather than hard-code names from a previous build.
function findReactAlias(src) {
  const useStateCounts = {};
  const jsxCounts = {};
  const useEffectCounts = {};
  for (const m of src.matchAll(/([a-zA-Z_$][\w$]*)\.useState\b/g)) {
    useStateCounts[m[1]] = (useStateCounts[m[1]] || 0) + 1;
  }
  for (const m of src.matchAll(/([a-zA-Z_$][\w$]*)\.jsx\b/g)) {
    jsxCounts[m[1]] = (jsxCounts[m[1]] || 0) + 1;
  }
  for (const m of src.matchAll(/([a-zA-Z_$][\w$]*)\.useEffect\b/g)) {
    useEffectCounts[m[1]] = (useEffectCounts[m[1]] || 0) + 1;
  }
  // Prefer an alias that has both useState and jsx (React itself in this bundle).
  const candidates = Object.keys(useStateCounts).filter(
    (k) => jsxCounts[k] && useEffectCounts[k]
  );
  if (candidates.length) {
    return candidates.sort((a, b) => useStateCounts[b] - useStateCounts[a])[0];
  }
  // Fall back to the most common useState alias if a combined one isn't found.
  if (Object.keys(useStateCounts).length === 0) {
    throw new Error("Could not find a React hooks alias (useState) in the monolith");
  }
  return Object.entries(useStateCounts).sort((a, b) => b[1] - a[1])[0][0];
}

function findJsxAlias(src) {
  // If the React alias has jsx, use it. Otherwise find the jsx-only factory.
  const react = findReactAlias(src);
  if (new RegExp(`\\b${react}\\.jsx\\b`).test(src)) {
    return react;
  }
  const jsxCounts = {};
  for (const m of src.matchAll(/([a-zA-Z_$][\w$]*)\.jsx\b/g)) {
    jsxCounts[m[1]] = (jsxCounts[m[1]] || 0) + 1;
  }
  if (Object.keys(jsxCounts).length === 0) {
    throw new Error("Could not find a JSX factory alias (jsx) in the monolith");
  }
  return Object.entries(jsxCounts).sort((a, b) => b[1] - a[1])[0][0];
}

// Find the minified async send function that takes {attachments, conversationId, ...}.
// The function name changes between upstream builds (e.g. Nka in 26.715/26.721.31836,
// Pka in 26.721.41059), so we detect it dynamically rather than hard-coding it.
function findSendFunction(src) {
  const m = src.match(/async function ([a-zA-Z_$][\w$]*)\(e,\{attachments:/);
  if (!m) throw new Error("Could not find the async send function (async function X(e,{attachments:) in the monolith");
  return m[1];
}

// ─── Read source and detect minified aliases ───

let mono = fs.readFileSync(MONO, "utf8");
let appMain = fs.readFileSync(APP_MAIN, "utf8");
const REACT = findReactAlias(mono);
const JSX = findJsxAlias(mono);
const SEND_FN = findSendFunction(mono);
const SEND_ANCHOR = `async function ${SEND_FN}(e,{attachments:`;
console.log(`[detect] React hooks/JSX alias: ${REACT}, JSX alias: ${JSX}`);
console.log(`[detect] Send function: ${SEND_FN}`);

// Idempotency
if (mono.includes(MARKER + ":applied")) {
  console.log("Already patched, skipping.");
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════
// 1. USAGE RUNTIME — Install __cdrUsageV1.summary() if missing
// ═══════════════════════════════════════════════════════════════

const USAGE_RUNTIME = `
function CDRInstallUsageRuntime(){/* ${MARKER}:usage-runtime */
if(globalThis.__cdrUsageV1&&typeof globalThis.__cdrUsageV1.summary==='function')return;
globalThis.__cdrUsageV1=globalThis.__cdrUsageV1||{};
globalThis.__cdrUsageV1.summary=function(threadKey){
try{
let data=JSON.parse(localStorage.getItem('cdr-usage-v1')||'null');
if(!data)return null;
let threads=data.threads||{};
let thread=threads[String(threadKey||'')];
if(!thread)return null;
let fiveHourDelta=null,weeklyDelta=null;
if(thread.windows&&thread.windows.fiveHour&&thread.baseline&&thread.baseline.fiveHour){
fiveHourDelta=Math.max(0,Number(thread.windows.fiveHour.usedPercent||0)-Number(thread.baseline.fiveHour.usedPercent||0))}
if(thread.windows&&thread.windows.weekly&&thread.baseline&&thread.baseline.weekly){
weeklyDelta=Math.max(0,Number(thread.windows.weekly.usedPercent||0)-Number(thread.baseline.weekly.usedPercent||0))}
return{fiveHourDelta,weeklyDelta,hasExactUsage:!(!thread.usage||!thread.usage.total),
usage:thread.usage||{total:{totalTokens:0},last:{totalTokens:0}},config:thread.config||{}}
}catch{return null}};
globalThis.__cdrUsageV1.assertCanStart=globalThis.__cdrUsageV1.assertCanStart||function(){return!0};
}CDRInstallUsageRuntime();
`;

// Inject usage runtime before the existing usage guard
const usageGuardAnchor = "/* codex-rebuild:usage-guard-v1 */";
if (mono.includes(usageGuardAnchor) && !mono.includes(MARKER + ":usage-runtime")) {
  mono = replaceOnce(mono, usageGuardAnchor, USAGE_RUNTIME + usageGuardAnchor, "install usage runtime");
  console.log("[ok] usage runtime installed");
} else if (!mono.includes(usageGuardAnchor) && !mono.includes(MARKER + ":usage-runtime")) {
  // Inject before P_a as fallback (guard against double-injection on partial-state re-runs)
  mono = tryReplace(mono, "function P_a(e){", USAGE_RUNTIME + "function P_a(e){", "install usage runtime (fallback)");
} else {
  console.log("[skip] usage runtime already present or guard not found");
}

// ═══════════════════════════════════════════════════════════════
// 2. CHAT MODEL CATALOG — CDRMergeChatModels
// ═══════════════════════════════════════════════════════════════

const MERGE_HELPER = `
function CDRMergeChatModels(e){/* ${MARKER}:catalog-merge */
try{
let result=P_a(e);
if(!result||typeof result!=='object')return result;
let options=Array.isArray(result.options)?result.options:[];
let versions=Array.isArray(result.versionOptions)?result.versionOptions:[];
let rawModels=Array.isArray(globalThis.__cdrChatRawModels)?globalThis.__cdrChatRawModels:[];
let rawTitleBySlug=new Map(rawModels.filter(m=>m&&typeof m.slug==='string').map(m=>[m.slug,String(m.title||m.slug)]));
let rows=[],models=[],seen=new Set();
for(let option of options){
if(!option||typeof option.slug!=='string'||!option.slug||option.hidden===!0)continue;
let apiEffort=option.thinkingEffort==null||option.thinkingEffort===''?'none':String(option.thinkingEffort);
let key=option.slug+':'+apiEffort;
if(seen.has(key))continue;seen.add(key);
let matchingVersion=versions.find(v=>Array.isArray(v&&v.options)&&v.options.some(c=>c&&c.slug===option.slug&&(c.thinkingEffort==null?'none':String(c.thinkingEffort))===apiEffort));
let rawTitle=rawTitleBySlug.get(option.slug);
let baseLabel=String(option.lane==='instant'?(rawTitle||option.modelLabel||option.slug):(matchingVersion&&matchingVersion.label||rawTitle||option.modelLabel||option.slug));
let variant=String(option.selectedLabel||option.title||'').trim();
let lowerBase=baseLabel.toLocaleLowerCase(),lowerVariant=variant.toLocaleLowerCase();
let displayName=!variant||lowerBase===lowerVariant||lowerVariant.startsWith(lowerBase+' ')?(variant||baseLabel):(baseLabel+' '+variant);
let modelId='chat:'+encodeURIComponent(option.slug)+':'+encodeURIComponent(apiEffort);
rows.push({id:modelId,model:modelId,apiModel:option.slug,modelLabel:displayName,sliderLabel:displayName,reasoningEffort:'none',apiEffort,powerSettingIndex:rows.length,lane:option.lane||null});
models.push({id:modelId,model:modelId,displayName,description:typeof option.description==='string'?option.description:'',hidden:!1,supportedReasoningEfforts:[{reasoningEffort:'none',description:displayName}],defaultReasoningEffort:'none',isDefault:!1});
}
if(!rows.length)return result;
let defaultRow=rows.find(r=>r.apiModel===result.defaultModelSlug)||rows[0];
let defaultSlug=defaultRow.model;
for(let m of models)m.isDefault=m.model===defaultSlug;
let stored='';
try{stored=localStorage.getItem('cdr-chat-model-selection')||''}catch{}
let selected=rows.find(r=>r.model===stored)||rows.find(r=>r.model===globalThis.__cdrChatSelectedModel)||defaultRow;
let signature=JSON.stringify([defaultSlug,rows.map(r=>[r.model,r.apiModel,r.apiEffort,r.modelLabel])]);
let changed=globalThis.__cdrChatCatalogSignature!==signature||globalThis.__cdrChatSelectedModel!==selected.model;
globalThis.__cdrChatCatalog=result;
globalThis.__cdrChatCatalogSignature=signature;
globalThis.__cdrChatDefaultSlug=defaultSlug;
globalThis.__cdrChatDefaultApiSlug=defaultRow.apiModel;
globalThis.__cdrChatPowerRows=rows;
globalThis.__cdrChatPickerModels=models;
globalThis.__cdrChatSelectedModel=selected.model;
try{localStorage.setItem('cdr-chat-model-selection',selected.model)}catch{}
if(changed){try{window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{count:rows.length,defaultModelSlug:defaultSlug,selectedModel:selected.model}}))}catch{}}
return result;
}catch(err){try{console.error('[cdr] CDRMergeChatModels',err)}catch{}return P_a(e)}
}`;

// Inject CDRMergeChatModels before P_a
if (!mono.includes(MARKER + ":catalog-merge")) {
  mono = tryReplace(mono, "function P_a(e){", MERGE_HELPER + "\nfunction P_a(e){", "inject CDRMergeChatModels");
}

// Hook into models() to use CDRMergeChatModels and store raw models
const modelsAnchor = "P_a(await this.request.getModelsResponse())";
if (mono.includes(modelsAnchor)) {
  const modelsReplacement = "(async()=>{let _r=await this.request.getModelsResponse();try{globalThis.__cdrChatRawModels=Array.isArray(_r&&_r.models)?_r.models:[]}catch{}return CDRMergeChatModels(_r)})()";
  mono = tryReplace(mono, modelsAnchor, modelsReplacement, "hook models() to CDRMergeChatModels");
  console.log("[ok] chat model catalog hooked");
} else {
  console.log("[warn] models() anchor not found");
}

// ═══════════════════════════════════════════════════════════════
// 3. CDRStickyChatSend — Chat mode send bridge
// ═══════════════════════════════════════════════════════════════

const BRIDGE = `
async function CDRStickyChatSend(e,t,n){/* ${MARKER}:bridge */
try{
function chatMode(){
try{if(globalThis.__cdrLocalModeV4&&typeof globalThis.__cdrLocalModeV4.mode==='function'&&globalThis.__cdrLocalModeV4.mode()==='chat')return!0}catch{}
try{if(document.documentElement.getAttribute('data-codex-product-mode')==='chat')return!0}catch{}
try{return String(localStorage.getItem('cdr-product-mode')||'').replace(/^["']|["']$/g,'')==='chat'}catch{return!1}
}
if(!chatMode())return!1;
function textOf(v){if(v==null)return'';if(typeof v==='string')return v;if(Array.isArray(v))return v.map(textOf).filter(Boolean).join('\\n');if(typeof v==='object'){if(typeof v.text==='string')return v.text;if(typeof v.content==='string')return v.content;if(Array.isArray(v.parts))return v.parts.map(textOf).filter(Boolean).join('\\n');if(Array.isArray(v.content))return v.content.map(textOf).filter(Boolean).join('\\n')}return''}
let text=String(textOf(n&&n.input)||'').trim();
if(!text)return'absorbed';
let key=String(t||'').includes(':')?String(t):'local:'+t;
let extrasKey='cdr-thread-extras:'+key;
let notify=()=>{try{window.dispatchEvent(new CustomEvent('cdr-thread-extras-change',{detail:{key}}))}catch{}};
let upsert=turn=>{try{let rows=JSON.parse(localStorage.getItem(extrasKey)||'[]');if(!Array.isArray(rows))rows=[];let val={...turn,id:turn.id||((crypto.randomUUID&&crypto.randomUUID())||'chat-'+Date.now()),ts:turn.ts||Date.now(),source:turn.source||'chat'};let idx=rows.findIndex(r=>r&&r.id===val.id);if(idx>=0)rows[idx]={...rows[idx],...val};else rows.push(val);localStorage.setItem(extrasKey,JSON.stringify(rows.slice(-400)));notify();return val.id}catch{return turn.id||null}};
upsert({role:'user',text:text.slice(0,8000),source:'chat'});
let client=null;
try{if(typeof MH!=='undefined')client=e.get(MH)}catch{}
if(!client||typeof client.startCompletionStream!=='function'){try{client=globalThis.__cdrChatClient}catch{}}
if(!client||typeof client.startCompletionStream!=='function'){try{client=globalThis.__cdrEnsureChatClient&&globalThis.__cdrEnsureChatClient()}catch{client=null}}
if(!client||typeof client.startCompletionStream!=='function'){
upsert({role:'assistant',text:'[Chat] ChatGPT client not available. Message was not sent.',source:'chat-error'});
return!0}
let logicalModel=globalThis.__cdrChatSelectedModel;
try{logicalModel=logicalModel||localStorage.getItem('cdr-chat-model-selection')}catch{}
let powerRows=Array.isArray(globalThis.__cdrChatPowerRows)?globalThis.__cdrChatPowerRows:[];
let selected=powerRows.find(r=>r.model===logicalModel)||powerRows.find(r=>r.model===globalThis.__cdrChatDefaultSlug)||powerRows[0];
let model=selected?selected.apiModel:(n&&n.model)||'gpt-5.6-sol';
let effort=selected?(selected.apiEffort==='none'||selected.apiEffort==='minimal'?void 0:selected.apiEffort):(n&&n.thinkingEffort&&(n.thinkingEffort==='none'||n.thinkingEffort==='minimal')?void 0:n&&n.thinkingEffort);
let store={};
try{store=JSON.parse(localStorage.getItem('cdr-chat-thread-state-v1')||'{}')||{}}catch{}
store.byLocal=store.byLocal&&typeof store.byLocal==='object'?store.byLocal:{};
let state=store.byLocal[key];
if(typeof state==='string')state={conversationId:state};
state=state&&typeof state==='object'?state:{};
let conversationId=typeof state.conversationId==='string'?state.conversationId:null;
let parentMessageId=typeof state.parentMessageId==='string'?state.parentMessageId:null;
let continuing=Boolean(conversationId&&parentMessageId);
if(!continuing){conversationId=null;parentMessageId=(crypto.randomUUID&&crypto.randomUUID())||'parent-'+Date.now()}
let priorContext='';
try{let ctx=globalThis.__cdrCodexContextByThread&&globalThis.__cdrCodexContextByThread[key];if(ctx&&typeof ctx.text==='string')priorContext=ctx.text}catch{}
let prompt=text;
if(!continuing&&priorContext)prompt=priorContext+'\\n\\n<current_user_message>\\n'+text+'\\n</current_user_message>';
let messageId=(crypto.randomUUID&&crypto.randomUUID())||'user-'+Date.now();
let assistantId=(crypto.randomUUID&&crypto.randomUUID())||'assistant-'+Date.now();
let assistant='';
let nextParent=null;
let seenConv=conversationId;
let flushTimer=null;
let flush=()=>{if(flushTimer!=null){clearTimeout(flushTimer);flushTimer=null}if(assistant)upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'streaming'})};
let scheduleFlush=()=>{if(flushTimer==null)flushTimer=setTimeout(flush,45)};
try{
await new Promise((resolve,reject)=>{
let settled=!1;
let timer=setTimeout(()=>{if(!settled){settled=!0;reject(new Error('Chat response timed out after 120s'))}},12e4);
let done=fn=>v=>{if(settled)return;settled=!0;clearTimeout(timer);fn(v)};
try{
client.startCompletionStream({
request:{
action:'next',
client_prepare_state:'sent',
conversation_id:conversationId||void 0,
messages:[{author:{role:'user'},content:{content_type:'text',parts:[prompt]},id:messageId,metadata:{}}],
model:model,
parent_message_id:parentMessageId,
thinking_effort:effort,
timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
timezone_offset_min:new Date().getTimezoneOffset()
},
onUpdate:u=>{try{if(!u)return;if(typeof u==='string'){assistant+=u;return}let msg=u.message||u;if(msg&&msg.content&&Array.isArray(msg.content.parts)){let snap=msg.content.parts.map(textOf).join('');if(snap){assistant=snap;scheduleFlush()}}else if(typeof u.text==='string'){assistant+=u.text;scheduleFlush()}else if(typeof u.delta==='string'){assistant+=u.delta;scheduleFlush()}}catch{}},
onEvent:ev=>{try{let d=ev&&ev.data;if(!d)return;if(typeof d==='string'){try{d=JSON.parse(d)}catch{return}}let cid=d.conversation_id||d.conversationId;if(cid)seenConv=cid;if(d.message&&d.message.id)nextParent=d.message.id;let parts=d.message&&d.message.content&&d.message.content.parts;if(Array.isArray(parts)){let snap=parts.map(textOf).join('');if(snap){assistant=snap;scheduleFlush()}}}catch{}},
onComplete:done(()=>resolve()),
onError:done(err=>reject(err&&err.error?err.error:err))
});
}catch(err){done(reject)(err)}
});
flush();
if(!assistant)assistant='Chat returned no displayable text.';
upsert({id:assistantId,role:'assistant',text:assistant.slice(0,16000),source:'chat',status:'completed'});
if(seenConv&&nextParent){
store.byLocal[key]={conversationId:seenConv,parentMessageId:nextParent,model:model,updatedAt:Date.now()};
try{localStorage.setItem('cdr-chat-thread-state-v1',JSON.stringify(store))}catch{}
try{let legacy=JSON.parse(localStorage.getItem('cdr-thread-map')||'{}')||{};legacy.byLocal=legacy.byLocal&&typeof legacy.byLocal==='object'?legacy.byLocal:{};legacy.byChat=legacy.byChat&&typeof legacy.byChat==='object'?legacy.byChat:{};legacy.byLocal[key]=seenConv;legacy.byChat[seenConv]=key;localStorage.setItem('cdr-thread-map',JSON.stringify(legacy))}catch{}
}
return!0;
}catch(err){
if(flushTimer!=null)clearTimeout(flushTimer);
upsert({id:assistantId,role:'assistant',text:'[Chat] '+String(err&&err.message||err).slice(0,2000),source:'chat-error',status:'completed'});
return!0;
}
}catch(err){try{console.error('[cdr] Chat bridge crashed',err)}catch{}return!0}
}
`;

// Inject bridge before the send function
if (!mono.includes(MARKER + ":bridge")) {
  mono = tryReplace(mono, SEND_ANCHOR, BRIDGE + "\n" + SEND_ANCHOR, "inject CDRStickyChatSend");
  console.log("[ok] CDRStickyChatSend bridge injected");
}

// ═══════════════════════════════════════════════════════════════
// 4. SEND HOOK — Intercept the send function in Chat mode
// ═══════════════════════════════════════════════════════════════

const sendHookAnchor = "let v=CH(),y=l.trim();";
const sendHookReplacement = "let v=CH(),y=l.trim();{/* " + MARKER + ":send-hook */try{if(globalThis.__cdrLocalModeV4&&typeof globalThis.__cdrLocalModeV4.mode==='function'&&globalThis.__cdrLocalModeV4.mode()==='chat'){let _cdrRes=await CDRStickyChatSend(e,n,{input:l,model:a,thinkingEffort:f,attachments:t});if(_cdrRes)return{conversationId:n,serverConversationId:null,streamRequestId:null};}}catch(_cdrErr){try{console.error('[cdr] send hook error',_cdrErr)}catch{}}}";

if (!mono.includes(MARKER + ":send-hook")) {
  mono = tryReplace(mono, sendHookAnchor, sendHookReplacement, `inject send hook into ${SEND_FN}`);
  console.log(`[ok] send hook injected into ${SEND_FN}`);
}

// ═══════════════════════════════════════════════════════════════
// 5. TRANSCRIPT PUBLISHER — Publish Codex transcript as Chat context
// ═══════════════════════════════════════════════════════════════

// The local-conversation-thread file has turn.items and .at(-1) patterns.
// We inject a useEffect that publishes the full Codex transcript to
// globalThis.__cdrCodexContextByThread so the bridge can use it as context.
//
// 26.721 thread file uses pg.useRef; we need to find its useEffect/useState alias.
// Since we can't know the exact alias, we inject a self-contained function
// that uses the global React module directly.

const threadFile = findThreadFile();
// Transcript publisher is now handled by the standalone script
// _apply-transcript-publisher-v1.js (added to PATCHES array in patch-all.js).
// The previous inline implementation was disabled with `if (false && ...)`
// due to a template literal escaping bug (literal newlines in string literals).
// The standalone script avoids the escaping issue by building the injected
// code from a string array with explicit \n escapes, and also reads from
// the correct data source (native codex turns via visibleTurnEntries) instead
// of localStorage extras (chat turns).
if (false /* transcript publisher moved to _apply-transcript-publisher-v1.js */ && threadFile && !process.env.CDR_SKIP_TRANSCRIPT) {
  let threadSrc = fs.readFileSync(threadFile, "utf8");
  if (!threadSrc.includes(MARKER + ":transcript")) {
    // Find a suitable injection point: look for a useEffect or similar pattern
    // in the thread file. We inject a self-running function that hooks into
    // the cdr-thread-extras-change event to build transcript context.
    const TRANSCRIPT_INJECT = `
;/* ${MARKER}:transcript */
(function CDRPublishTranscript(){
if(globalThis.__cdrTranscriptPublisher)return;globalThis.__cdrTranscriptPublisher=!0;
function textOf(v){if(v==null)return'';if(typeof v==='string')return v;if(Array.isArray(v))return v.map(textOf).filter(Boolean).join('\n');if(typeof v==='object'){if(typeof v.text==='string')return v.text;if(typeof v.content==='string')return v.content;for(let k of ['message','agentMessage','userMessage','output_text']){let f=textOf(v[k]);if(f)return f}if(Array.isArray(v.parts))return v.parts.map(textOf).filter(Boolean).join('');if(Array.isArray(v.content))return v.content.map(textOf).filter(Boolean).join('\n')}return''}
try{window.addEventListener('cdr-thread-extras-change',function(ev){
try{let d=ev&&ev.detail;if(!d||!d.key)return;
let key=d.key;let rows=JSON.parse(localStorage.getItem('cdr-thread-extras:'+key)||'[]');
if(!Array.isArray(rows)||!rows.length)return;
let lines=[];
for(let row of rows.slice(-50)){
if(!row||!row.text)continue;
let role=row.role==='user'?'User':'Assistant';
let line=role+': '+String(row.text).trim();
if(lines[lines.length-1]!==line)lines.push(line)}
if(!lines.length)return;
let transcript=lines.join('\n\n---\n\n');
let text='You are continuing an existing Codex task in Chat mode. The transcript below is authoritative prior conversation context. Continue naturally, preserve all decisions and constraints, and do not mention this handoff unless asked.\n\n<codex_transcript>\n'+transcript+'\n</codex_transcript>';
globalThis.__cdrCodexContextByThread=globalThis.__cdrCodexContextByThread||{};
globalThis.__cdrCodexContextByThread[key]={text:text,turnCount:lines.length,updatedAt:Date.now()}
}catch{}})}catch{}
})();
`;
    // Inject at the end of the file
    threadSrc = threadSrc + TRANSCRIPT_INJECT;
    if (!process.argv.includes("--check")) {
      fs.writeFileSync(threadFile, threadSrc);
    }
    console.log("[ok] transcript publisher injected into thread file");
  } else {
    console.log("[skip] transcript publisher already present");
  }
} else if (!threadFile) {
  console.log("[warn] local-conversation-thread file not found, skipping transcript publisher");
} else {
  console.log("[skip] transcript publisher — handled by _apply-transcript-publisher-v1.js");
}

// ═══════════════════════════════════════════════════════════════
// 6. USAGE BADGES — CDRTaskUsageBadge + CDRTurnUsageBadge
// ═══════════════════════════════════════════════════════════════

// The React hooks/JSX aliases differ between modules in the monolith.
// e.g. in the old u6c scope the parameter `e` shadowed the React alias.
// We locate the action row dynamically by the thumbs_up/thumbs_down pattern,
// capture the real aliases, and inject the badge functions in the same scope.

// Find the action-row render pattern: children:[(0,JSX.jsx)(Rating,{rating:`thumbs_up`,selectedRating:l,onClick:h}),...]
const ACTION_ROW_RE = /children:\[\(0,([a-zA-Z_$][\w$]*)\.jsx\)\(([a-zA-Z_$][\w$]+),\{rating:\`thumbs_up\`,selectedRating:([a-zA-Z_$][\w$]*),onClick:([a-zA-Z_$][\w$]*)\}\),\(0,\1\.jsx\)\(\2,\{rating:\`thumbs_down\`,selectedRating:\3,onClick:\4\}\)\]/;

function findActionRow(src) {
  const m = src.match(ACTION_ROW_RE);
  if (!m) return null;
  return {
    full: m[0],
    jsx: m[1],
    rating: m[2],
    selectedRating: m[3],
    onClick: m[4],
    index: m.index,
  };
}

// Detect the React hooks alias from a slice around the injection point.
function findLocalAliases(src, anchor) {
  const idx = src.indexOf(anchor);
  if (idx === -1) return null;
  const slice = src.slice(Math.max(0, idx - 5000), idx + 5000);
  return { react: findReactAlias(slice), jsx: findJsxAlias(slice) };
}

let BADGE_REACT = REACT;
let BADGE_JSX = JSX;
let actionRow = findActionRow(mono);
let badgeFunctionName = null;
if (actionRow) {
  // Find the containing function name by brace-balancing backwards from the action row.
  function findContainingFunction(src, idx) {
    const re = /function\s+([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
    let m;
    const candidates = [];
    while ((m = re.exec(src.slice(0, idx))) !== null) {
      candidates.push({ name: m[1], start: m.index, braceEnd: m.index + m[0].length - 1 });
    }
    for (let i = candidates.length - 1; i >= 0; i--) {
      const fn = candidates[i];
      let depth = 1, j = fn.braceEnd + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      if (j > idx) return fn;
    }
    return null;
  }
  const containingFn = findContainingFunction(mono, actionRow.index);
  if (containingFn) badgeFunctionName = containingFn.name;
  console.log(`[detect] Action row in ${badgeFunctionName || '?'}: JSX=${actionRow.jsx}, Rating=${actionRow.rating}, selectedRating=${actionRow.selectedRating}, onClick=${actionRow.onClick}`);

  // JSX alias is exactly what the action row uses. For the React hooks alias,
  // look inside the containing function body for the actual .useState alias,
  // excluding the function's own parameter names.
  BADGE_JSX = actionRow.jsx;
  try {
    if (containingFn) {
      // Extract parameter names from the function signature
      const sigMatch = mono.slice(containingFn.start).match(/^function\s+[a-zA-Z_$][\w$]*\s*\(([^)]*)\)/);
      const paramNames = sigMatch ? sigMatch[1].split(',').map(s => s.trim().match(/^[a-zA-Z_$][\w$]*/)[0]) : [];
      const fnBodyStart = containingFn.braceEnd + 1;
      const fnBodyEnd = (() => { let depth=1, j=fnBodyStart; while(j<mono.length && depth>0){ if(mono[j]==='{')depth++; else if(mono[j]==='}')depth--; j++; } return j; })();
      const fnSlice = mono.slice(fnBodyStart, fnBodyEnd);
      // Custom alias finder that excludes function parameters
      const useStateCounts = {};
      for (const m of fnSlice.matchAll(/([a-zA-Z_$][\w$]*)\.useState\b/g)) {
        if (!paramNames.includes(m[1])) useStateCounts[m[1]] = (useStateCounts[m[1]] || 0) + 1;
      }
      if (Object.keys(useStateCounts).length > 0) {
        BADGE_REACT = Object.entries(useStateCounts).sort((a,b) => b[1] - a[1])[0][0];
      }
    }
  } catch (e) {
    console.log(`[warn] could not detect local React hooks alias; falling back to ${REACT}`);
    BADGE_REACT = REACT;
  }
  console.log(`[detect] Badge aliases: React=${BADGE_REACT}, JSX=${BADGE_JSX}`);
} else {
  console.log("[warn] action-row pattern not found; usage badges will not be placed");
}

const TASK_BADGE = `
function CDRTaskUsageBadge({threadId}){/* ${MARKER}:task-usage-badge */
let [,setTick]=(0,${BADGE_REACT}.useState)(0);
(0,${BADGE_REACT}.useEffect)(()=>{
let update=(event)=>{
let d=event&&event.detail;
if(d&&d.threadKey===threadId||(Array.isArray(d&&d.aliases)&&d.aliases.includes(threadId))){
setTick(v=>v+1)}
};
try{window.addEventListener('cdr-usage-change',update)}catch{}
return()=>{try{window.removeEventListener('cdr-usage-change',update)}catch{}}
},[threadId]);
let mode='codex';
try{mode=globalThis.__cdrLocalModeV4&&typeof globalThis.__cdrLocalModeV4.mode==='function'?globalThis.__cdrLocalModeV4.mode():'codex'}catch{}
if(mode==='chat')return null;
let summary=null;
try{summary=globalThis.__cdrUsageV1&&typeof globalThis.__cdrUsageV1.summary==='function'?globalThis.__cdrUsageV1.summary(threadId):null}catch{}
if(!summary)return null;
let parts=[];
if(summary.fiveHourDelta!=null)parts.push('5h +'+summary.fiveHourDelta.toFixed(1)+'%');
if(summary.weeklyDelta!=null)parts.push('7d +'+summary.weeklyDelta.toFixed(1)+'%');
if(summary.hasExactUsage&&summary.usage&&summary.usage.total&&summary.usage.total.totalTokens!=null){
parts.push(Number(summary.usage.total.totalTokens).toLocaleString()+' tokens')}
if(!parts.length)return null;
return(0,${BADGE_JSX}.jsx)('span',{className:'ml-1.5 flex h-full items-center gap-1.5 text-xs leading-5 text-token-text-tertiary',title:'Observed task usage. Quota values are account-usage deltas since this task began; token totals are exact AppServer counters.','aria-label':'Task usage: '+parts.join(', '),children:[(0,${BADGE_JSX}.jsx)('span',{className:'h-3 border-l border-token-border','aria-hidden':!0}),(0,${BADGE_JSX}.jsx)('span',{children:parts.join(' · ')})]})}
`;

const TURN_BADGE = `
function CDRTurnUsageBadge({threadId,turnId}){/* ${MARKER}:turn-usage-badge */
let snap=(0,${BADGE_REACT}.useRef)(null),[,setTick]=(0,${BADGE_REACT}.useState)(0);
(0,${BADGE_REACT}.useEffect)(()=>{
let key=String(threadId)+':'+String(turnId);
if(!globalThis.__cdrTurnUsage)globalThis.__cdrTurnUsage={};
if(globalThis.__cdrTurnUsage[key])snap.current=globalThis.__cdrTurnUsage[key];
let keys=Object.keys(globalThis.__cdrTurnUsage);if(keys.length>200){for(let i=0;i<keys.length-200;i++)delete globalThis.__cdrTurnUsage[keys[i]]}
let capture=()=>{
if(snap.current!=null)return;
try{
let s=globalThis.__cdrUsageV1&&typeof globalThis.__cdrUsageV1.summary==='function'?globalThis.__cdrUsageV1.summary(threadId):null;
if(s&&s.usage&&s.usage.last&&s.usage.last.totalTokens>0){
let l=s.usage.last;
snap.current={inputTokens:l.inputTokens||0,cachedInputTokens:l.cachedInputTokens||0,outputTokens:l.outputTokens||0,reasoningOutputTokens:l.reasoningOutputTokens||0,totalTokens:l.totalTokens||0};
globalThis.__cdrTurnUsage[key]=snap.current;
setTick(v=>v+1)
}
}catch{};
};
let timer=setTimeout(capture,300);
let listener=(e)=>{
let d=e&&e.detail;
if(d&&d.threadKey===threadId||(Array.isArray(d&&d.aliases)&&d.aliases.includes(threadId)))capture()
};
try{window.addEventListener('cdr-usage-change',listener)}catch{}
return()=>{clearTimeout(timer);try{window.removeEventListener('cdr-usage-change',listener)}catch{}}
},[threadId,turnId]);
let tu=snap.current;
if(!tu||tu.totalTokens===0)return null;
let fmt=n=>Number(n||0).toLocaleString();
let parts=[];
if(tu.inputTokens>0)parts.push('in '+fmt(tu.inputTokens));
if(tu.cachedInputTokens>0)parts.push('cached '+fmt(tu.cachedInputTokens));
if(tu.outputTokens>0)parts.push('out '+fmt(tu.outputTokens));
if(tu.reasoningOutputTokens>0)parts.push('reason '+fmt(tu.reasoningOutputTokens));
parts.push('= '+fmt(tu.totalTokens));
return(0,${BADGE_JSX}.jsx)('span',{className:'ml-1.5 select-none whitespace-nowrap text-xs tabular-nums text-token-text-tertiary',title:'Tokens for this turn only — not affected by parallel tasks','aria-label':'Turn usage: '+parts.join(', '),children:parts.join(' · ')})}
`;

// Inject badges before the action-row function and attach them to the row
if (actionRow && !mono.includes(MARKER + ":task-usage-badge")) {
  // Inject the badge function definitions before the containing function
  if (badgeFunctionName) {
    const fnPattern = new RegExp(`(function\\s+${badgeFunctionName}\\s*\\([^)]*\\)\\s*\\{)`);
    const fnMatch = mono.match(fnPattern);
    if (fnMatch) {
      const insertAt = fnMatch.index;
      mono = mono.slice(0, insertAt) + TASK_BADGE + "\n" + TURN_BADGE + "\n" + mono.slice(insertAt);
      console.log("[ok] usage badges injected");
    } else {
      console.log("[warn] could not locate containing function for badge injection");
    }
  }

  // Append badge components to the action-row children array
  if (!mono.includes("CDRTaskUsageBadge,{threadId:i}")) {
    const renderOld = actionRow.full;
    const renderNew = `children:[(0,${actionRow.jsx}.jsx)(${actionRow.rating},{rating:\`thumbs_up\`,selectedRating:${actionRow.selectedRating},onClick:${actionRow.onClick}}),(0,${actionRow.jsx}.jsx)(${actionRow.rating},{rating:\`thumbs_down\`,selectedRating:${actionRow.selectedRating},onClick:${actionRow.onClick}}),(0,${actionRow.jsx}.jsx)(CDRTaskUsageBadge,{threadId:i}),(0,${actionRow.jsx}.jsx)(CDRTurnUsageBadge,{threadId:i,turnId:a})]`;
    if (mono.includes(renderOld)) {
      mono = mono.replace(renderOld, renderNew);
      console.log("[ok] usage badges placed in action row");
    } else {
      console.log("[warn] action-row children block not found, skipping badge placement");
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. ERROR BOUNDARY — Stash errors to localStorage
// ═══════════════════════════════════════════════════════════════

// Try backtick version first (26.721 minifier uses backtick strings)
const errorBoundaryAnchors = [
  "try{Hf.error(`error boundary`,{safe:{name:this.props.name},sensitive:{error:e,componentStack:t??``}})}catch{}this.setState({error:r,componentStack:t,eventId:i})",
  "try{Hf.error('error boundary',{safe:{name:this.props.name},sensitive:{error:e,componentStack:t??''}})}catch{}this.setState({error:r,componentStack:t,eventId:i})",
];

const errorBoundaryReplacement = (anchor) => {
  const stashCode = "try{localStorage.setItem('cdr-last-error',JSON.stringify({at:Date.now(),name:this.props.name,message:String(r&&r.message||r),stack:String(r&&r.stack||''),componentStack:String(n||'')}))}catch{}/* " + MARKER + ":error-boundary */";
  return anchor.replace("this.setState({error:r,componentStack:t,eventId:i})", stashCode + "this.setState({error:r,componentStack:t,eventId:i})");
};

if (!mono.includes(MARKER + ":error-boundary")) {
  let replaced = false;
  for (const anchor of errorBoundaryAnchors) {
    if (mono.includes(anchor)) {
      mono = replaceOnce(mono, anchor, errorBoundaryReplacement(anchor), "instrument error boundary");
      console.log("[ok] error boundary instrumented");
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    // Try a broader search for the setState pattern
    const broaderAnchor = "this.setState({error:r,componentStack:t,eventId:i})";
    if (mono.includes(broaderAnchor)) {
      const stashCode = "try{localStorage.setItem('cdr-last-error',JSON.stringify({at:Date.now(),message:String(r&&r.message||r),stack:String(r&&r.stack||''),componentStack:String(t||'')}))}catch{}/* " + MARKER + ":error-boundary */";
      mono = replaceOnce(mono, broaderAnchor, stashCode + broaderAnchor, "instrument error boundary (broad)");
      console.log("[ok] error boundary instrumented (broad match)");
    } else {
      console.log("[warn] error boundary anchor not found");
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. APP-MAIN FALLBACK — Stash errors and show details
// ═══════════════════════════════════════════════════════════════

const appMainAnchor = "fallback:(0,G.jsx)(r,{})";
const appMainReplacement = "fallback:function(err){try{localStorage.setItem('cdr-last-error',JSON.stringify({at:Date.now(),message:String(err&&err.error&&err.error.message||err),stack:String(err&&err.error&&err.error.stack||''),componentStack:String(err&&err.componentStack||'')}))}catch{}try{console.error('[cdr] App error boundary',err&&err.error||err)}catch{}return(0,G.jsx)(r,{})}/* " + MARKER + ":app-main-fb */";

if (!appMain.includes(MARKER + ":app-main-fb")) {
  appMain = tryReplace(appMain, appMainAnchor, appMainReplacement, "instrument app-main fallback");
  console.log("[ok] app-main fallback instrumented");
}

// ═══════════════════════════════════════════════════════════════
// 8. FINAL MARKER + VERIFY
// ═══════════════════════════════════════════════════════════════

// (applied marker is added after verification below)

// Verify
const checks = [
  [MARKER + ":bridge", "CDRStickyChatSend bridge"],
  [MARKER + ":send-hook", `Send hook in ${SEND_FN}`],
  [MARKER + ":task-usage-badge", "Task usage badge"],
  [MARKER + ":turn-usage-badge", "Turn usage badge"],
  ["CDRTaskUsageBadge,{threadId:i}", "Task badge placement"],
  ["CDRTurnUsageBadge,{threadId:i,turnId:a}", "Turn badge placement"],
];

let allOk = true;
for (const [marker, label] of checks) {
  if (mono.includes(marker)) {
    console.log(`[verify] ✓ ${label}`);
  } else {
    console.log(`[verify] ✗ ${label} — MISSING`);
    allOk = false;
  }
}

// Check error boundary
if (mono.includes(MARKER + ":error-boundary")) {
  console.log("[verify] ✓ Error boundary instrumentation");
} else {
  console.log("[verify] ✗ Error boundary instrumentation — MISSING (non-fatal)");
}

// Check app-main
if (appMain.includes(MARKER + ":app-main-fb")) {
  console.log("[verify] ✓ App-main fallback instrumentation");
} else {
  console.log("[verify] ✗ App-main fallback instrumentation — MISSING (non-fatal)");
}

// Check catalog
if (mono.includes(MARKER + ":catalog-merge")) {
  console.log("[verify] ✓ Chat model catalog merge");
} else {
  console.log("[verify] ✗ Chat model catalog merge — MISSING (non-fatal)");
}

// Check usage runtime
if (mono.includes(MARKER + ":usage-runtime")) {
  console.log("[verify] ✓ Usage runtime");
} else {
  console.log("[verify] ✗ Usage runtime — MISSING (non-fatal)");
}

// Check transcript publisher (in thread file)
if (threadFile && fs.readFileSync(threadFile, "utf8").includes(MARKER + ":transcript")) {
  console.log("[verify] ✓ Transcript publisher");
} else {
  console.log("[verify] ⚠ Transcript publisher — not in monolith (separate file)");
}

// Parse check (non-fatal for the huge monolith)
try {
  parseOk("monolith", mono);
  console.log("[verify] ✓ Monolith parses OK");
} catch (e) {
  console.log(`[verify] ⚠ Monolith parse warning: ${e.message.slice(0, 200)}`);
}

// Add final applied marker ONLY if all critical checks passed
if (allOk) {
  const appliedMarker = "/* " + MARKER + ":applied */";
  if (!mono.includes(appliedMarker)) {
    mono = tryReplace(mono, "function P_a(e){", appliedMarker + "\nfunction P_a(e){", "add applied marker");
  }
}

if (!allOk) {
  console.error("\n[x] Critical features failed to apply; see the warnings above.");
  console.error("[x] Refusing to continue: a silent partial apply is how the 26.721");
  console.error("[x] rebase shipped a DMG with fake usage badges and no usage panel.");
  process.exit(1);
}

// ─── Write back ───

if (!process.argv.includes("--check")) {
  fs.writeFileSync(MONO, mono);
  fs.writeFileSync(APP_MAIN, appMain);
  console.log("\n✅ All features written to source.");
  console.log("Run build-from-upstream.js to pack the ASAR and create the DMG.");
} else {
  console.log("\n✅ Check complete (no files written).");
}

