#!/usr/bin/env node
"use strict";
/**
 * chat-catalog-v5 — ChatGPT-web consumer set, but replace GPT-5.5 Thinking
 * with GPT-5.6 Sol Medium + GPT-5.6 Sol High (explicit allowlist).
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-catalog-v5";
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

const NEW_SLUG = `function CDRIsCodexModelSlug(m){/* ${MARKER}:codex-slug */let s=String(m||'').toLowerCase();if(!s)return!1;if(/^gpt-5[.-]?6-sol$/.test(s))return!1;return/gpt-5[.-]?6|\\bsol\\b|\\bterra\\b|\\bluna\\b|codex-|codex_|-codex\\b|\\bcodex\\b|-sol-|-terra-|-luna-|sol-wm|terra-wm|luna-wm/.test(s)}`;

const NEW_FALLBACK = `function CDRChatFallbackRows(){/* ${MARKER}:fallback-rows */return[
{id:'chat:auto:none',model:'chat:auto:none',apiModel:'auto',modelLabel:'Auto',sliderLabel:'Auto',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:0,lane:'instant'},
{id:'chat:gpt-5-5-instant:none',model:'chat:gpt-5-5-instant:none',apiModel:'gpt-5-5-instant',modelLabel:'GPT-5.5 Instant',sliderLabel:'GPT-5.5 Instant',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:1,lane:'instant'},
{id:'chat:gpt-5.6-sol:medium',model:'chat:gpt-5.6-sol:medium',apiModel:'gpt-5.6-sol',modelLabel:'GPT-5.6 Sol Medium',sliderLabel:'GPT-5.6 Sol Medium',reasoningEffort:'none',apiEffort:'medium',powerSettingIndex:2,lane:'thinking'},
{id:'chat:gpt-5.6-sol:high',model:'chat:gpt-5.6-sol:high',apiModel:'gpt-5.6-sol',modelLabel:'GPT-5.6 Sol High',sliderLabel:'GPT-5.6 Sol High',reasoningEffort:'none',apiEffort:'high',powerSettingIndex:3,lane:'thinking'},
{id:'chat:o3:none',model:'chat:o3:none',apiModel:'o3',modelLabel:'o3',sliderLabel:'o3',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:4,lane:'thinking'}
]}`;

const NEW_MERGE = `function CDRMergeChatModels(e){/* ${MARKER}:catalog-merge */
try{
let result=P_a(e);
if(!result||typeof result!=='object')return result;
let versions=Array.isArray(result.versionOptions)?result.versionOptions:[];
let rawModels=Array.isArray(globalThis.__cdrChatRawModels)?globalThis.__cdrChatRawModels:[];
let rawTitleBySlug=new Map(rawModels.filter(m=>m&&typeof m.slug==='string').map(m=>[m.slug,String(m.title||m.slug)]));
let isCodex=typeof CDRIsCodexModelSlug==='function'?CDRIsCodexModelSlug:(m=>!1);
let isCodexFamily=v=>{
  let id=String(v&&v.id||'').toLowerCase();
  let label=String(v&&v.label||'').toLowerCase();
  let slugs=Array.isArray(v&&v.slugs)?v.slugs.join(' '):'';
  return isCodex(id)||isCodex(label)||isCodex(slugs)||/sol|terra|luna|codex/.test(id+' '+label);
};
let isDroppedThinking=slug=>{
  let s=String(slug||'').toLowerCase();
  return /gpt-5[.-]?5-thinking/.test(s)||s==='gpt-5.5-thinking'||s==='gpt-5-5-thinking';
};
let generic=/^(instant|thinking|medium|high|low|auto|pro|mini|standard|extended)$/i;
let rows=[],models=[],seen=new Set(),seenLabel=new Set();
let pushRow=(slug,label,apiEffort,lane,versionId,description,force)=>{
  if(!slug)return;
  if(!force&&(isCodex(slug)||isCodex(label)||isDroppedThinking(slug)))return;
  let effort=apiEffort==null||apiEffort===''?'none':String(apiEffort);
  let key=slug+':'+effort;
  if(seen.has(key))return;
  let displayName=String(label||rawTitleBySlug.get(slug)||slug).trim();
  if(!displayName)return;
  let labelKey=displayName.toLocaleLowerCase();
  if(seenLabel.has(labelKey))return;
  seen.add(key);seenLabel.add(labelKey);
  let modelId='chat:'+encodeURIComponent(slug)+':'+encodeURIComponent(effort);
  rows.push({id:modelId,model:modelId,apiModel:slug,modelLabel:displayName,sliderLabel:displayName,reasoningEffort:'none',apiEffort:effort,powerSettingIndex:rows.length,lane:lane||null,versionId:versionId||null});
  models.push({id:modelId,model:modelId,displayName,description:typeof description==='string'?description:'',hidden:!1,supportedReasoningEfforts:[{reasoningEffort:'none',description:displayName}],defaultReasoningEffort:'none',isDefault:!1});
};
let labelFor=(option,version)=>{
  let sel=String(option.selectedLabel||'').trim();
  let tit=String(option.title||option.modelTitle||'').trim();
  let ver=String(version&&version.label||'').trim();
  let raw=rawTitleBySlug.get(option.slug);
  if(sel&&!generic.test(sel))return sel;
  if(raw&&!generic.test(raw))return raw;
  if(ver&&sel&&generic.test(sel))return ver+' '+sel;
  if(ver&&tit&&generic.test(tit))return ver+' '+tit;
  if(ver&&tit&&tit.toLocaleLowerCase()!==ver.toLocaleLowerCase())return ver+' '+tit;
  return sel||tit||ver||option.slug;
};
for(let v of versions){
  if(!v||isCodexFamily(v)||!Array.isArray(v.options))continue;
  for(let option of v.options){
    if(!option||typeof option.slug!=='string'||!option.slug)continue;
    if(option.hidden===!0)continue;
    if(isDroppedThinking(option.slug))continue;
    if(isCodex(option.slug))continue;
    pushRow(option.slug,labelFor(option,v),option.thinkingEffort,option.lane,v.id,option.description,!1);
  }
}
if(result.defaultModelSlug==='auto'||rawTitleBySlug.has('auto')){
  pushRow('auto',rawTitleBySlug.get('auto')||'Auto','none','instant',null,null,!1);
}
/* Replace GPT-5.5 Thinking with Sol Medium / High */
pushRow('gpt-5.6-sol','GPT-5.6 Sol Medium','medium','thinking','sol',null,!0);
pushRow('gpt-5.6-sol','GPT-5.6 Sol High','high','thinking','sol',null,!0);
if(!rows.length){
  for(let raw of rawModels){
    if(!raw||typeof raw.slug!=='string')continue;
    if(isCodex(raw.slug)||isCodex(raw.title)||isDroppedThinking(raw.slug))continue;
    if(/-wm$/i.test(raw.slug))continue;
    pushRow(raw.slug,raw.title||raw.slug,raw.default_thinking_effort||'none',null,null,raw.description,!1);
  }
  pushRow('gpt-5.6-sol','GPT-5.6 Sol Medium','medium','thinking','sol',null,!0);
  pushRow('gpt-5.6-sol','GPT-5.6 Sol High','high','thinking','sol',null,!0);
}
if(!rows.length){try{let fb=CDRChatFallbackRows();globalThis.__cdrChatPowerRows=fb;globalThis.__cdrChatDefaultSlug=fb[0].model;globalThis.__cdrChatDefaultApiSlug=fb[0].apiModel;globalThis.__cdrChatSelectedModel=fb[0].model;window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{source:'merge-fallback'}}))}catch{}return result;}
let prefer=['auto','gpt-5-5-instant','gpt-5-5','gpt-5.5'];
let defaultRow=null;
for(let slug of prefer){defaultRow=rows.find(r=>r.apiModel===slug);if(defaultRow)break;}
if(!defaultRow)defaultRow=rows.find(r=>r.apiModel===result.defaultModelSlug)||rows[0];
let defaultSlug=defaultRow.model;
for(let m of models)m.isDefault=m.model===defaultSlug;
let stored='';
try{stored=localStorage.getItem('cdr-chat-model-selection')||''}catch{}
let selected=rows.find(r=>r.model===stored)||rows.find(r=>r.model===globalThis.__cdrChatSelectedModel)||defaultRow;
if(!rows.some(r=>r.model===selected.model))selected=defaultRow;
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

function patchStickyAllowSol(mono) {
  const next =
    `let isCodexModel=m=>{/* ${MARKER}:allow-sol */let s=String(m||'').toLowerCase();if(!s)return!1;if(/^gpt-5[.-]?6-sol$/.test(s))return!1;return/gpt-5[.-]?6|\\bsol\\b|\\bterra\\b|\\bluna\\b|codex-|codex_|\\bcodex\\b/.test(s)};`;
  if (mono.includes(MARKER + ":allow-sol")) {
    console.log("[skip] sticky already allows Sol");
    return mono;
  }
  const sticky = mono.indexOf("async function CDRStickyChatSend");
  if (sticky < 0) {
    console.log("[warn] sticky send missing");
    return mono;
  }
  const end = Math.min(mono.length, sticky + 4000);
  const chunk = mono.slice(sticky, end);
  const m = chunk.match(
    /let isCodexModel=m=>\{let s=String\(m\|\|''\)\.toLowerCase\(\);return!s\?!1:\/gpt-5[^;]*\.test\(s\)\};/,
  );
  if (!m) {
    console.log("[warn] sticky isCodexModel not found");
    return mono;
  }
  const at = sticky + m.index;
  mono = mono.slice(0, at) + next + mono.slice(at + m[0].length);
  console.log("[ok] sticky send allows gpt-5.6-sol");
  return mono;
}

function main() {
  let mono = fs.readFileSync(MONO, "utf8");
  const already = mono.includes(MARKER + ":catalog-merge");

  if (!already) {
    mono = replaceFn(mono, "CDRIsCodexModelSlug", NEW_SLUG);
    console.log("[ok] Sol allowlisted in Codex slug filter");
    mono = replaceFn(mono, "CDRChatFallbackRows", NEW_FALLBACK);
    console.log("[ok] fallback: Instant + Sol Medium/High");
    mono = replaceFn(mono, "CDRMergeChatModels", NEW_MERGE);
    console.log("[ok] merge: drop 5.5 Thinking, inject Sol Medium/High");
  } else {
    console.log("[skip] v5 catalog already applied");
  }

  mono = patchStickyAllowSol(mono);

  if (!mono.includes(MARKER + ":applied")) {
    mono = mono.replace(
      /\/\* codex-rebuild:chat-catalog-v[0-9]+[a-z]*:applied \*\//g,
      (m) => m + `/* ${MARKER}:applied */`,
    );
    if (!mono.includes(MARKER + ":applied")) {
      mono = mono.replace(
        "async function CDRStickyChatSend(",
        `/* ${MARKER}:applied */async function CDRStickyChatSend(`,
      );
    }
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
