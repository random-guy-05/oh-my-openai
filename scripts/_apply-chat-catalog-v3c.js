#!/usr/bin/env node
"use strict";
/**
 * catalog-v3c — Better labels (use raw titles) + stricter Codex/5.6 filter.
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-catalog-v3c";
const monoName = fs
  .readdirSync(ASSETS)
  .find((f) => f.startsWith("app-initial-") && f.endsWith(".js"));
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

const NEW_SLUG = `function CDRIsCodexModelSlug(m){/* ${MARKER}:codex-slug */let s=String(m||'').toLowerCase();if(!s)return!1;return/gpt-5[.-]?6|\\bsol\\b|\\bterra\\b|\\bluna\\b|codex-|codex_|-codex\\b|\\bcodex\\b|-sol-|-terra-|-luna-/.test(s)}`;

const NEW_MERGE = `function CDRMergeChatModels(e){/* ${MARKER}:catalog-merge */
try{
let result=P_a(e);
if(!result||typeof result!=='object')return result;
let versions=Array.isArray(result.versionOptions)?result.versionOptions:[];
let rawModels=Array.isArray(globalThis.__cdrChatRawModels)?globalThis.__cdrChatRawModels:[];
let rawTitleBySlug=new Map(rawModels.filter(m=>m&&typeof m.slug==='string').map(m=>[m.slug,String(m.title||m.slug)]));
let isCodex=typeof CDRIsCodexModelSlug==='function'?CDRIsCodexModelSlug:(m=>!1);
let rows=[],models=[],seen=new Set();
let niceLabel=(slug,selected,title,versionLabel)=>{
  let raw=rawTitleBySlug.get(slug);
  let sel=String(selected||'').trim();
  let tit=String(title||'').trim();
  let ver=String(versionLabel||'').trim();
  let generic=/^(instant|thinking|medium|high|low|auto|pro|mini)$/i;
  if(sel&&!generic.test(sel))return sel;
  if(raw)return raw;
  if(ver&&tit&&tit.toLocaleLowerCase()!==ver.toLocaleLowerCase())return ver+' '+tit;
  if(sel&&ver&&generic.test(sel))return ver+' '+sel;
  return sel||tit||ver||slug;
};
let pushRow=(slug,label,apiEffort,lane,versionId,description)=>{
  if(!slug||isCodex(slug)||isCodex(label))return;
  let effort=apiEffort==null||apiEffort===''?'none':String(apiEffort);
  let key=slug+':'+effort;
  if(seen.has(key))return;seen.add(key);
  let displayName=String(label||slug);
  let modelId='chat:'+encodeURIComponent(slug)+':'+encodeURIComponent(effort);
  rows.push({id:modelId,model:modelId,apiModel:slug,modelLabel:displayName,sliderLabel:displayName,reasoningEffort:'none',apiEffort:effort,powerSettingIndex:rows.length,lane:lane||null,versionId:versionId||null});
  models.push({id:modelId,model:modelId,displayName,description:typeof description==='string'?description:'',hidden:!1,supportedReasoningEfforts:[{reasoningEffort:'none',description:displayName}],defaultReasoningEffort:'none',isDefault:!1});
};
for(let v of versions){
  if(!v||!Array.isArray(v.options))continue;
  for(let option of v.options){
    if(!option||typeof option.slug!=='string')continue;
    let displayName=niceLabel(option.slug,option.selectedLabel,option.title||option.modelTitle,v.label);
    pushRow(option.slug,displayName,option.thinkingEffort,option.lane,v.id,option.description);
  }
}
for(let raw of rawModels){
  if(!raw||typeof raw.slug!=='string'||!raw.slug)continue;
  let already=[...seen].some(k=>k.startsWith(raw.slug+':'));
  if(already)continue;
  pushRow(raw.slug,raw.title||raw.slug,raw.default_thinking_effort||'none',null,null,raw.description);
}
if(!rows.length&&Array.isArray(result.options)){
  for(let option of result.options){
    if(!option||typeof option.slug!=='string')continue;
    pushRow(option.slug,niceLabel(option.slug,option.selectedLabel,option.title,null),option.thinkingEffort,option.lane,null,option.description);
  }
}
if(!rows.length){try{let fb=CDRChatFallbackRows();globalThis.__cdrChatPowerRows=fb;globalThis.__cdrChatDefaultSlug=fb[0].model;globalThis.__cdrChatDefaultApiSlug=fb[0].apiModel;globalThis.__cdrChatSelectedModel=fb[0].model;window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{source:'merge-fallback'}}))}catch{}return result;}
let defaultRow=rows.find(r=>r.apiModel===result.defaultModelSlug)||rows.find(r=>r.apiModel==='gpt-5-5-instant')||rows.find(r=>r.apiModel==='gpt-5-5')||rows[0];
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

let mono = fs.readFileSync(MONO, "utf8");
if (mono.includes(MARKER + ":catalog-merge")) {
  console.log("[skip] v3c already present");
  process.exit(0);
}

mono = replaceFn(mono, "CDRIsCodexModelSlug", NEW_SLUG);
mono = replaceFn(mono, "CDRMergeChatModels", NEW_MERGE);

if (!mono.includes(MARKER + ":applied")) {
  mono = mono.replace(
    /\/\* codex-rebuild:chat-catalog-v3b?:applied \*\//,
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
console.log("[ok] v3c labels + stricter 5.6 filter");
