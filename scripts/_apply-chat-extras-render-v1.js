#!/usr/bin/env node
"use strict";

/**
 * Keep Chat turns in the same native local-task transcript.
 *
 * Chat transport writes durable rows under cdr-thread-extras:local:<taskId>.
 * This patch overlays those rows at the existing LocalConversationThread
 * render seam, so changing tasks never changes the sidebar/router and no
 * native Codex history is replaced.
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-extras-render-v1";

function findLocalFile() {
  const name = fs
    .readdirSync(ASSETS)
    .find((file) => file.includes("local-conversation-thread") && file.endsWith(".js"));
  if (!name) throw new Error("local-conversation-thread bundle not found");
  return path.join(ASSETS, name);
}

function parse(source, file) {
  try {
    return acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${path.basename(file)} parse failed: ${error.message}`);
  }
}

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visitor));
    else if (value?.type) walk(value, visitor);
  }
}

function findThreadComponent(source, file) {
  const ast = parse(source, file);
  const candidates = [];
  walk(ast, (node) => {
    if (
      !["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(
        node.type,
      )
    ) return;
    const body = source.slice(node.start, node.end);
    if (
      body.includes("renderEntries:ie,visibleTurnEntries:ae") &&
      body.includes("H(S,{conversationId:e,isBackgroundSubagentsEnabled:c})") &&
      /\.useEffect\)/.test(body)
    ) {
      candidates.push(node);
    }
  });
  candidates.sort((a, b) => a.end - a.start - (b.end - b.start));
  if (!candidates[0]) {
    throw new Error(
      `${path.basename(file)} LocalConversationThread render seam drifted; expected visibleTurnEntries/renderEntries destructure`,
    );
  }
  return candidates[0];
}

const OVERLAY = String.raw`/* ${MARKER}:overlay */
let [CDRExtraTick,CDRSetExtraTick]=(0,NO.useState)(0);
let [CDRDurableRows,CDRSetDurableRows]=(0,NO.useState)(null);
(0,NO.useEffect)(()=>{let CDRActive=!0,CDRKey='local:'+e,CDRLoadDurable=()=>{try{let CDRRequest=globalThis.indexedDB.open('cdr-chat-history-v1',1);CDRRequest.onupgradeneeded=()=>{let CDRDb=CDRRequest.result;if(!CDRDb.objectStoreNames.contains('threads'))CDRDb.createObjectStore('threads')};CDRRequest.onsuccess=()=>{try{let CDRGet=CDRRequest.result.transaction('threads','readonly').objectStore('threads').get('cdr-thread-extras:'+CDRKey);CDRGet.onsuccess=()=>{if(CDRActive&&Array.isArray(CDRGet.result))CDRSetDurableRows(CDRGet.result)}}catch{}}}catch{}};let CDROnExtras=CDREvent=>{let CDRDetail=CDREvent?.detail;if(CDRDetail?.key&&CDRDetail.key!==CDRKey)return;if(Array.isArray(CDRDetail?.rows))CDRSetDurableRows(CDRDetail.rows);else CDRLoadDurable();CDRSetExtraTick(CDRValue=>CDRValue+1)};CDRLoadDurable();try{window.addEventListener('cdr-thread-extras-change',CDROnExtras);return()=>{CDRActive=!1;window.removeEventListener('cdr-thread-extras-change',CDROnExtras)}}catch{return()=>{CDRActive=!1}}},[e]);
void CDRExtraTick;
try{
  let CDRExtraKey='cdr-thread-extras:local:'+e,CDRExtraRaw=localStorage.getItem(CDRExtraKey)||'[]';
  let CDRExtraCache=globalThis.__cdrChatHistoryRenderCache;
  if(!CDRExtraCache||CDRExtraCache.key!==CDRExtraKey||CDRExtraCache.raw!==CDRExtraRaw){
    let CDRParsed=JSON.parse(CDRExtraRaw);if(!Array.isArray(CDRParsed))CDRParsed=[];
    CDRExtraCache={key:CDRExtraKey,raw:CDRExtraRaw,rows:CDRParsed,mapped:null};
    globalThis.__cdrChatHistoryRenderCache=CDRExtraCache;
  }
  if(Array.isArray(CDRDurableRows)&&CDRExtraCache.rows!==CDRDurableRows){let CDRLocalLast=Number(CDRExtraCache.rows.at(-1)?.ts)||0,CDRDurableLast=Number(CDRDurableRows.at(-1)?.ts)||0;if(!CDRExtraCache.rows.length||CDRDurableLast>=CDRLocalLast){CDRExtraCache={...CDRExtraCache,rows:CDRDurableRows,mapped:null};globalThis.__cdrChatHistoryRenderCache=CDRExtraCache}}
  let CDRExtraRows=CDRExtraCache.rows;
  if(Array.isArray(CDRExtraRows)&&CDRExtraRows.length){
    let CDRExtraMapped=CDRExtraCache.mapped||(CDRExtraCache.mapped=CDRExtraRows.map((CDRRow,CDRIndex)=>{
      if(!CDRRow||typeof CDRRow!=='object'||!String(CDRRow.text||'').trim())return null;
      let CDRText=String(CDRRow.text),CDRUser=CDRRow.role==='user',CDRId='cdr-extra-'+CDRIndex+'-'+String(CDRRow.ts||CDRIndex);
      let CDRItem=CDRUser?{id:CDRId+'-item',type:'userMessage',content:[{type:'text',text:CDRText,text_elements:[]}],attachments:[]}:{id:CDRId+'-item',type:'agentMessage',text:CDRText,phase:null,memoryCitation:null};
      let CDRTurn={id:CDRId,turnId:CDRId,status:'completed',turnStartedAtMs:Number(CDRRow.ts)||Date.now(),durationMs:null,finalAssistantStartedAtMs:Number(CDRRow.ts)||Date.now(),error:null,diff:null,items:[CDRItem],params:{model:null,cwd:null,threadId:e,input:CDRUser?[{type:'text',text:CDRText,text_elements:[]}]:[],attachments:[],clientUserMessageId:null},cdrSource:'chat'};
      return{physicalTurnIds:[CDRId],preserveServerUserMessages:!1,requests:[],turn:CDRTurn,turnId:CDRId,turnIndex:1e6+CDRIndex,turnKey:CDRId,turnSearchKey:CDRId,cdrSource:'chat'};
    }).filter(Boolean));
    if(CDRExtraMapped.length){
      let CDRMerge=(CDRNative,CDRChat)=>[...CDRNative.map((entry,index)=>({entry,index,ts:Number(entry?.turn?.turnStartedAtMs)||Number.MAX_SAFE_INTEGER-1,kind:0})),...CDRChat.map((entry,index)=>({entry,index,ts:Number(entry?.turn?.turnStartedAtMs)||Number.MAX_SAFE_INTEGER,kind:1}))].sort((a,b)=>a.ts-b.ts||a.kind-b.kind||a.index-b.index).map(value=>value.entry);
      ae=CDRMerge(ae.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped);
      ie=CDRMerge(ie.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped);
      /* Keep latestVisibleTurnId native. Synthetic Chat IDs are render-only;
         assigning one to ne makes native resume/visibility bookkeeping treat
         a local overlay row as an AppServer turn. */
      te=!0;B=B||CDRExtraRows.some(CDRRow=>CDRRow&&CDRRow.role==='user');
    }
  }
}catch{}
`;

function patch(source, file) {
  if (source.includes(MARKER + ":overlay")) {
    if (
      source.includes("__cdrChatHistoryRenderCache") &&
      source.includes("CDRSetDurableRows") &&
      source.includes("CDRDetail?.rows") &&
      source.includes("CDRDurableLast>=CDRLocalLast") &&
      !source.includes("if(!CDRRenderHasGap)")
    ) {
      parse(source, file);
      return source;
    }
    const node = findThreadComponent(source, file);
    let component = source.slice(node.start, node.end);
    const start = component.indexOf(`/* ${MARKER}:overlay */`);
    const end = component.indexOf("let oe=", start);
    const hookAlias = component.match(/\(0,([A-Za-z_$][\w$]*)\.useEffect\)/)?.[1];
    if (start < 0 || end < 0 || !hookAlias) throw new Error("existing Chat history overlay boundaries drifted");
    component = component.slice(0, start) + OVERLAY.replaceAll("NO", hookAlias) + component.slice(end);
    const upgraded = source.slice(0, node.start) + component + source.slice(node.end);
    parse(upgraded, file);
    return upgraded;
  }
  const node = findThreadComponent(source, file);
  let component = source.slice(node.start, node.end);
  const anchor = "renderEntries:ie,visibleTurnEntries:ae}=H(S,{conversationId:e,isBackgroundSubagentsEnabled:c}),";
  if (component.split(anchor).length - 1 !== 1) {
    throw new Error(`${path.basename(file)} render seam anchor count is not exactly one`);
  }
  const hookAlias = component.match(/\(0,([A-Za-z_$][\w$]*)\.useEffect\)/)?.[1];
  if (!hookAlias) throw new Error(`${path.basename(file)} React effect hook alias drifted`);
  const overlay = OVERLAY.replaceAll("NO", hookAlias);
  // The destructure is part of a minified `let` declaration; terminate that
  // declaration before declaring the event subscription/state hook, then
  // restore the original `oe=...` initializer as a new `let` declaration.
  component = component.replace(anchor, anchor.slice(0, -1) + ";" + overlay + "let ");
  const next = source.slice(0, node.start) + component + source.slice(node.end);
  parse(next, file);
  return next;
}

function main() {
  const file = findLocalFile();
  const source = fs.readFileSync(file, "utf8");
  const next = patch(source, file);
  if (!process.argv.includes("--check")) fs.writeFileSync(file, next);
  console.log(process.argv.includes("--check") ? "chat extras render check ok" : `chat extras render patched ${path.basename(file)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

module.exports = { findThreadComponent, patch };
