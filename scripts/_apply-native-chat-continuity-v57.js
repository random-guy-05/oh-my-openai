#!/usr/bin/env node
"use strict";

/**
 * v57: native Chat continuity for Codex tasks.
 *
 * Removes the sticky localStorage/rendering bridge and returns Chat mode to the
 * native ChatGPT composer + conversation renderer. A local Codex transcript is
 * published as plain text, injected as a hidden system message on the first
 * native Chat send, and the resulting Chat conversation is mapped back to the
 * originating local task.
 */

const acorn = require("acorn");
const asar = require("@electron/asar");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = process.env.CDR_ASAR_ROOT
  ? path.resolve(process.env.CDR_ASAR_ROOT)
  : path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const CLEAN_ASAR = path.join(ROOT, "out/app-chat-usage-v42.asar");
const MARKER = "codex-rebuild:native-chat-continuity-v57";

const FILES = {
  page: "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  settings: "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  chat: "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  send: "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  local: "local-conversation-thread-Bnxyo76e.js",
  turns: "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  errorBoundary: "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~appgen-settings-p~jj50pjos-D3LKdNnF.js",
};

function assert(value, message) {
  if (!value) throw new Error(message);
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  assert(count === 1, `${label}: expected 1 match, found ${count}`);
  return source.replace(from, to);
}

function cleanAsset(name) {
  assert(fs.existsSync(CLEAN_ASAR), `Missing clean baseline ${CLEAN_ASAR}`);
  return asar.extractFile(CLEAN_ASAR, `webview/assets/${name}`).toString("utf8");
}

function parseOk(label, source) {
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

const HARD_CODED_CATALOG =
  "function CDRMergeChatModels(e){const t=[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol High`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol Medium`,thinkingEffort:`medium`},{description:null,lane:`instant`,selectedLabel:`5.5 Instant`,slug:`gpt-5.5`,title:`5.5 Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5.4`,slug:`gpt-5.4`,title:`5.4`},{description:null,lane:`thinking`,selectedLabel:`o3`,slug:`o3`,title:`o3`}];return{defaultModelSlug:`gpt-5.6-sol`,options:t,internalOptions:[],versionOptions:[],sliderSettings:[]}}/* codex-rebuild:chat-usage-v41:helper */";

const PATCHED_FALLBACK =
  "ir=`gpt-5.6-sol`,ar=[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol High`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol Medium`,thinkingEffort:`medium`},{description:null,lane:`instant`,selectedLabel:`5.5 Instant`,slug:`gpt-5.5`,title:`5.5 Instant`},{description:null,lane:`thinking`,selectedLabel:`o3`,slug:`o3`,title:`o3`}],or={defaultModelSlug:ir,options:ar}/* codex-rebuild:chat-usage-v41:placeholder */";
const OFFICIAL_FALLBACK =
  "ir=`auto`,ar=[{description:null,lane:`instant`,selectedLabel:`GPT-5 Instant`,slug:ir,title:`Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5 Thinking`,slug:`gpt-5-thinking`,title:`Thinking`}],or={defaultModelSlug:ir,options:ar,versionOptions:[{defaultModelSlug:ir,id:`gpt-5`,label:`GPT-5`,modelSlugByLane:{auto:ir,thinking:`gpt-5-thinking`},options:ar,slugs:[ir,`gpt-5-thinking`]}]}";

function restoreOfficialCatalog(source) {
  source = replaceOnce(source, HARD_CODED_CATALOG, "", "remove hardcoded Chat catalog");
  source = replaceOnce(
    source,
    "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v41:merge */",
    "async models(){return Hn(await this.request.getModelsResponse())}/* " + MARKER + ":official-models */",
    "restore official models response",
  );
  source = replaceOnce(
    source,
    "this.safeGet(`/models`,{parameters:{query:{iim:!0,include_icons:!1}}})/* codex-rebuild:chat-usage-v41:iim */",
    "this.safeGet(`/models`,{parameters:{query:{iim:!1,include_icons:!1}}})",
    "restore official model query",
  );
  source = replaceOnce(source, PATCHED_FALLBACK, OFFICIAL_FALLBACK, "restore official fallback catalog");
  return source;
}

const MODE_BLOCK =
  "let CDROnLocal=!!am(`/local/:conversationId`),CDROnRemote=!!am(`/remote/:conversationId`);(0,BI.useLayoutEffect)(()=>{/* codex-rebuild:chat-usage-v42:sync */if(CDRMode===`chat`){if(CDROnLocal||CDROnRemote){try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}a(`/`,{replace:!0,state:{chatGptProjectId:null,chatGptProjectName:null,focusComposerNonce:Date.now()}})}else{try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,CDROnLocal,CDROnRemote,r,i,a,s]);u=e=>{/* codex-rebuild:chat-usage-v42:mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}a(`/`,{replace:!0,state:{chatGptProjectId:null,chatGptProjectName:null,focusComposerNonce:Date.now()}});return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};";

const NATIVE_MODE_BLOCK =
  "let CDRLocalMatch=am(`/local/:conversationId`),CDRRemoteMatch=am(`/remote/:conversationId`),CDROnLocal=!!CDRLocalMatch,CDROnRemote=!!CDRRemoteMatch;" +
  "let CDRGoNativeChat=()=>{/* " + MARKER + ":handoff */try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}" +
  "let id=CDRLocalMatch?.params?.conversationId||null,key=id?`local:`+id:null,map={};try{map=JSON.parse(localStorage.getItem(`cdr-thread-map`)||`{}`)||{}}catch{}let mapped=key&&map.byLocal&&map.byLocal[key];" +
  "if(mapped){a(`/work/conversation/`+encodeURIComponent(mapped),{replace:!0});return}" +
  "let context=key&&globalThis.__cdrCodexContextByThread?.[key]?.text||``;a(`/`,{replace:!0,state:{chatGptProjectId:null,chatGptProjectName:null,focusComposerNonce:Date.now(),cdrContinueThreadKey:key,cdrCodexContext:context}})};" +
  "(0,BI.useLayoutEffect)(()=>{/* " + MARKER + ":sync */if(CDRMode===`chat`){if(CDROnLocal||CDROnRemote)CDRGoNativeChat();else{try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,CDROnLocal,CDROnRemote,r,i,a,s]);" +
  "u=e=>{/* " + MARKER + ":mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){CDRGoNativeChat();return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};";

function patchPage(source) {
  source = replaceOnce(source, MODE_BLOCK, NATIVE_MODE_BLOCK, "native Chat handoff routing");

  const submitCallback =
    "let z;t[25]!==w||t[26]!==a?(z=e=>{a(cm(e,{isTemporaryChat:w}),{replace:!0})},t[25]=w,t[26]=a,t[27]=z):z=t[27];";
  const mappedSubmit =
    "let z=e=>{/* " + MARKER + ":map */try{let key=f?.cdrContinueThreadKey;if(key){let map=JSON.parse(localStorage.getItem(`cdr-thread-map`)||`{}`)||{};map.byLocal=map.byLocal&&typeof map.byLocal===`object`?map.byLocal:{};map.byChat=map.byChat&&typeof map.byChat===`object`?map.byChat:{};map.byLocal[key]=e;map.byChat[e]=key;localStorage.setItem(`cdr-thread-map`,JSON.stringify(map))}}catch{}a(cm(e,{isTemporaryChat:w}),{replace:!0})};";
  source = replaceOnce(source, submitCallback, mappedSubmit, "map native Chat conversation");

  source = replaceOnce(
    source,
    "):B=t[38];let V;",
    "):B=t[38];if(f?.cdrCodexContext){let CDRContext=String(f.cdrCodexContext);B={...B,getExtraDeveloperInstructions:()=>[CDRContext]};}/* " + MARKER + ":hidden-context */let V;",
    "inject hidden Codex context",
  );
  return source;
}

const CONTEXT_HELPER =
  "function CDRPublishCodexContext(key,entries){/* " + MARKER + ":transcript */try{" +
  "let textOf=v=>{if(v==null)return``;if(typeof v===`string`)return v;if(Array.isArray(v))return v.map(textOf).filter(Boolean).join(`\\n`);if(typeof v!==`object`)return``;for(let k of[`text`,`content`,`message`,`agentMessage`,`userMessage`,`output_text`]){let x=textOf(v[k]);if(x)return x}if(Array.isArray(v.parts))return textOf(v.parts);return``};" +
  "let lines=[];for(let entry of Array.isArray(entries)?entries:[]){let turn=entry?.turn||entry,items=Array.isArray(turn?.items)?turn.items:[];for(let item of items){let body=textOf(item).trim();if(!body)continue;let role=item?.type===`userMessage`||item?.role===`user`?`User`:`Assistant`;let line=role+`: `+body;if(lines[lines.length-1]!==line)lines.push(line)}}" +
  "let transcript=lines.join(`\\n\\n---\\n\\n`),max=36e4;if(transcript.length>max)transcript=transcript.slice(0,3e4)+`\\n\\n[Middle of transcript omitted only to stay within the model context window.]\\n\\n`+transcript.slice(-(max-3e4));" +
  "let text=`You are continuing an existing Codex task in Chat mode. The transcript below is authoritative prior conversation context. Continue naturally from it, preserve decisions and constraints, and do not mention this handoff unless the user asks.\\n\\n<codex_transcript>\\n`+transcript+`\\n</codex_transcript>`;" +
  "globalThis.__cdrCodexContextByThread=globalThis.__cdrCodexContextByThread||{};globalThis.__cdrCodexContextByThread[key]={text,turnCount:lines.length,updatedAt:Date.now()};" +
  "}catch{}}";

function patchLocal(source) {
  source = source.replace("function Cw(", CONTEXT_HELPER + "function Cw(");
  const anchor =
    "M=du(e),{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l}),V=B.at(-1)";
  const replacement =
    "M=du(e),{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l});(0,Tw.useEffect)(()=>{CDRPublishCodexContext(`local:`+e,B)},[e,B]);let V=B.at(-1)";
  return replaceOnce(source, anchor, replacement, "publish Codex transcript");
}

function verify(files) {
  for (const [label, source] of Object.entries(files)) parseOk(label, source);
  assert(files.page.includes(MARKER + ":handoff"), "native handoff missing");
  assert(files.page.includes(MARKER + ":hidden-context"), "hidden context injection missing");
  assert(files.page.includes(MARKER + ":map"), "thread mapping missing");
  assert(files.local.includes(MARKER + ":transcript"), "transcript publisher missing");
  assert(files.chat.includes(MARKER + ":official-models"), "official model pipeline missing");
  assert(!files.chat.includes("function CDRMergeChatModels"), "custom model merge remains");
  assert(!files.send.includes("CDRStickyChatSend"), "sticky send bridge remains");
  assert(!files.local.includes("cdr-thread-extras"), "fake transcript extras remain");
  assert(!files.settings.includes("CDRChatFlatSelector"), "non-native Chat selector remains");
  assert(!files.settings.includes("chat-models-v56"), "v56 picker patch remains");
  assert(!files.turns.includes("cdr-thread-extras"), "turn atom extras remain");
}

const files = {};
for (const [label, name] of Object.entries(FILES)) files[label] = cleanAsset(name);
files.chat = restoreOfficialCatalog(files.chat);
files.page = patchPage(files.page);
files.local = patchLocal(files.local);
verify(files);

if (!process.argv.includes("--check")) {
  for (const [label, name] of Object.entries(FILES)) {
    fs.writeFileSync(path.join(ASSETS, name), files[label]);
  }
}

const output = process.env.CDR_PACKED_ASAR
  ? path.resolve(process.env.CDR_PACKED_ASAR)
  : path.join(ROOT, "out/app-native-chat-continuity-v57.asar");

if (process.argv.includes("--pack")) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  asar.createPackage(ASAR_ROOT, output).then(() => console.log(`v57 packed ${output}`));
} else {
  console.log(process.argv.includes("--check") ? "v57 check ok" : "v57 sources written");
}
