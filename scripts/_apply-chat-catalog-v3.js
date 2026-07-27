#!/usr/bin/env node
"use strict";
/**
 * chat-catalog-v3 — Build Chat picker from ALL versionOptions (+ raw models),
 * not just result.options (which is only the first version's presets —
 * hence "GPT-5.5 Instant" alone).
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-catalog-v3";
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

function replaceFn(src, name, next) {
  const e = functionExtentByName(src, name);
  return src.slice(0, e.start) + next + src.slice(e.end);
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

const NEW_MERGE = `function CDRMergeChatModels(e){/* ${MARKER}:catalog-merge */
try{
let result=P_a(e);
if(!result||typeof result!=='object')return result;
let versions=Array.isArray(result.versionOptions)?result.versionOptions:[];
let rawModels=Array.isArray(globalThis.__cdrChatRawModels)?globalThis.__cdrChatRawModels:[];
let rawTitleBySlug=new Map(rawModels.filter(m=>m&&typeof m.slug==='string').map(m=>[m.slug,String(m.title||m.slug)]));
/* Prefer ALL versionOptions (every ChatGPT family). result.options is only the
   first version's presets — that is why the picker collapsed to GPT-5.5 Instant. */
let collected=[];
for(let v of versions){
  if(!v||!Array.isArray(v.options))continue;
  for(let option of v.options){
    if(!option)continue;
    collected.push({option,version:v});
  }
}
if(!collected.length&&Array.isArray(result.options)){
  for(let option of result.options)collected.push({option,version:null});
}
let rows=[],models=[],seen=new Set();
for(let entry of collected){
let option=entry.option,matchingVersion=entry.version;
if(!option||typeof option.slug!=='string'||!option.slug||option.hidden===!0)continue;
let apiEffort=option.thinkingEffort==null||option.thinkingEffort===''?'none':String(option.thinkingEffort);
let key=option.slug+':'+apiEffort;
if(seen.has(key))continue;seen.add(key);
let rawTitle=rawTitleBySlug.get(option.slug);
let versionLabel=matchingVersion&&matchingVersion.label?String(matchingVersion.label):'';
let selected=String(option.selectedLabel||'').trim();
let title=String(option.title||option.modelTitle||'').trim();
let lane=option.lane?String(option.lane):'';
let displayName=selected||(versionLabel&&title&&title.toLocaleLowerCase()!==versionLabel.toLocaleLowerCase()?versionLabel+' '+title:(versionLabel||title||rawTitle||option.slug));
if(lane&&!/instant|thinking|auto|pro/i.test(displayName)&&lane!=='auto'){
  let laneLabel=lane.replace(/_/g,' ');
  laneLabel=laneLabel.charAt(0).toUpperCase()+laneLabel.slice(1);
  if(!displayName.toLocaleLowerCase().includes(laneLabel.toLocaleLowerCase()))displayName=displayName+' '+laneLabel;
}
if(typeof CDRIsCodexModelSlug==='function'&&(CDRIsCodexModelSlug(option.slug)||CDRIsCodexModelSlug(displayName)||CDRIsCodexModelSlug(rawTitle)))continue;
let modelId='chat:'+encodeURIComponent(option.slug)+':'+encodeURIComponent(apiEffort);
rows.push({id:modelId,model:modelId,apiModel:option.slug,modelLabel:displayName,sliderLabel:displayName,reasoningEffort:'none',apiEffort,powerSettingIndex:rows.length,lane:option.lane||null,versionId:matchingVersion&&matchingVersion.id||null});
models.push({id:modelId,model:modelId,displayName,description:typeof option.description==='string'?option.description:'',hidden:!1,supportedReasoningEfforts:[{reasoningEffort:'none',description:displayName}],defaultReasoningEffort:'none',isDefault:!1});
}
/* Also surface any raw ChatGPT slugs missing from version presets (e.g. legacy). */
for(let raw of rawModels){
  if(!raw||typeof raw.slug!=='string'||!raw.slug)continue;
  if(typeof CDRIsCodexModelSlug==='function'&&CDRIsCodexModelSlug(raw.slug))continue;
  let key=raw.slug+':none';
  if(seen.has(key))continue;
  /* Skip if any effort variant of this slug already listed */
  let already=[...seen].some(k=>k.startsWith(raw.slug+':'));
  if(already)continue;
  seen.add(key);
  let displayName=String(raw.title||raw.slug);
  let modelId='chat:'+encodeURIComponent(raw.slug)+':none';
  rows.push({id:modelId,model:modelId,apiModel:raw.slug,modelLabel:displayName,sliderLabel:displayName,reasoningEffort:'none',apiEffort:'none',powerSettingIndex:rows.length,lane:null,versionId:null});
  models.push({id:modelId,model:modelId,displayName,description:typeof raw.description==='string'?raw.description:'',hidden:!1,supportedReasoningEfforts:[{reasoningEffort:'none',description:displayName}],defaultReasoningEffort:'none',isDefault:!1});
}
if(!rows.length){try{let fb=CDRChatFallbackRows();globalThis.__cdrChatPowerRows=fb;globalThis.__cdrChatDefaultSlug=fb[0].model;globalThis.__cdrChatDefaultApiSlug=fb[0].apiModel;globalThis.__cdrChatSelectedModel=fb[0].model;window.dispatchEvent(new CustomEvent('cdr-chat-models-change',{detail:{source:'merge-fallback'}}))}catch{}return result;}
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

const NEW_FALLBACK = `function CDRChatFallbackRows(){/* ${MARKER}:fallback-rows */return[
{id:'chat:auto:none',model:'chat:auto:none',apiModel:'auto',modelLabel:'Auto',sliderLabel:'Auto',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:0,lane:'instant'},
{id:'chat:gpt-5.5:none',model:'chat:gpt-5.5:none',apiModel:'gpt-5.5',modelLabel:'GPT-5.5 Instant',sliderLabel:'GPT-5.5 Instant',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:1,lane:'instant'},
{id:'chat:gpt-5.5-thinking:none',model:'chat:gpt-5.5-thinking:none',apiModel:'gpt-5.5-thinking',modelLabel:'GPT-5.5 Thinking',sliderLabel:'GPT-5.5 Thinking',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:2,lane:'thinking'},
{id:'chat:gpt-5.1:none',model:'chat:gpt-5.1:none',apiModel:'gpt-5.1',modelLabel:'GPT-5.1',sliderLabel:'GPT-5.1',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:3,lane:'instant'},
{id:'chat:gpt-5.1-thinking:none',model:'chat:gpt-5.1-thinking:none',apiModel:'gpt-5.1-thinking',modelLabel:'GPT-5.1 Thinking',sliderLabel:'GPT-5.1 Thinking',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:4,lane:'thinking'},
{id:'chat:o3:none',model:'chat:o3:none',apiModel:'o3',modelLabel:'o3',sliderLabel:'o3',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:5,lane:'thinking'},
{id:'chat:o4-mini:none',model:'chat:o4-mini:none',apiModel:'o4-mini',modelLabel:'o4-mini',sliderLabel:'o4-mini',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:6,lane:'instant'},
{id:'chat:gpt-4.1:none',model:'chat:gpt-4.1:none',apiModel:'gpt-4.1',modelLabel:'GPT-4.1',sliderLabel:'GPT-4.1',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:7,lane:'instant'},
{id:'chat:gpt-4o:none',model:'chat:gpt-4o:none',apiModel:'gpt-4o',modelLabel:'GPT-4o',sliderLabel:'GPT-4o',reasoningEffort:'none',apiEffort:'none',powerSettingIndex:8,lane:'instant'}
]}`;

function main() {
  let mono = fs.readFileSync(MONO, "utf8");
  if (mono.includes(MARKER + ":applied")) {
    console.log("[skip] already applied");
    return;
  }

  mono = replaceFn(mono, "CDRMergeChatModels", NEW_MERGE);
  console.log("[ok] CDRMergeChatModels → versionOptions catalog");

  mono = replaceFn(mono, "CDRChatFallbackRows", NEW_FALLBACK);
  console.log("[ok] fallback rows updated for GPT-5.5");

  // Mark applied near sticky send / prior markers
  if (!mono.includes(MARKER + ":applied")) {
    if (mono.includes("/* codex-rebuild:chat-real-v2:applied */")) {
      mono = mono.replace(
        "/* codex-rebuild:chat-real-v2:applied */",
        `/* codex-rebuild:chat-real-v2:applied *//* ${MARKER}:applied */`,
      );
    } else {
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
