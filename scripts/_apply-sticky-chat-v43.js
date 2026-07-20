#!/usr/bin/env node
"use strict";
/**
 * sticky-chat-v43
 *
 * User wants sticky continuity: same /local/:id thread when switching
 * Chat ↔ Work ↔ Codex, with full transcript — NOT navigate-away to ChatGPT home.
 *
 * Also: Chat mode uses discrete ChatGPT-style models + ChatGPT usage (not AppServer).
 *
 * Changes:
 * 1) Page: restore setMode-only sticky; force native surface to stay `codex`
 * 2) Settings picker: Chat = Sol High/Medium, 5.5 Instant, GPT-5.4, o3
 * 3) Publish ChatGPT client; bridge oD when sticky=chat to startCompletionStream
 * 4) Mirror Chat turns into cdr-thread-extras; merge into /local transcript UI
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v43";

const PAGE = path.join(
  ASSETS,
  "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
);
const SETTINGS = path.join(
  ASSETS,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const CHAT = path.join(
  ASSETS,
  "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
const SEND = path.join(
  ASSETS,
  "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
);
const LOCAL = path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js");
const TURNS = path.join(
  ASSETS,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
);

const LIVE_ASARS = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

function assert(c, m) {
  if (!c) throw new Error(m);
}
function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1, got ${n}`);
  return src.replace(from, to);
}
function parseOk(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (err) {
    throw new Error(`${label} parse failed: ${err.message}`);
  }
}

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher|Codex\.app|Codex\.payload/.test(line))
        continue;
      if (/cursor-agent|grep|sticky-chat|_apply-/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

const CHAT_HELPERS =
  "function CDRChatPowerSelections(){return[{id:`gpt-5.6-sol:high`,model:`gpt-5.6-sol`,modelLabel:`Sol High`,reasoningEffort:`high`,powerSettingIndex:0},{id:`gpt-5.6-sol:medium`,model:`gpt-5.6-sol`,modelLabel:`Sol Medium`,reasoningEffort:`medium`,powerSettingIndex:1},{id:`gpt-5.5:none`,model:`gpt-5.5`,modelLabel:`5.5 Instant`,reasoningEffort:`none`,powerSettingIndex:2},{id:`gpt-5.4:medium`,model:`gpt-5.4`,modelLabel:`GPT-5.4`,reasoningEffort:`medium`,powerSettingIndex:3},{id:`o3:medium`,model:`o3`,modelLabel:`o3`,reasoningEffort:`medium`,powerSettingIndex:4}]}function CDRChatModelsForPicker(){return[{id:`gpt-5.6-sol`,model:`gpt-5.6-sol`,displayName:`Sol`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`high`,description:`Sol High`},{reasoningEffort:`medium`,description:`Sol Medium`}],defaultReasoningEffort:`high`,isDefault:!0},{id:`gpt-5.5`,model:`gpt-5.5`,displayName:`5.5 Instant`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`none`,description:`5.5 Instant`}],defaultReasoningEffort:`none`,isDefault:!1},{id:`gpt-5.4`,model:`gpt-5.4`,displayName:`GPT-5.4`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`medium`,description:`GPT-5.4`}],defaultReasoningEffort:`medium`,isDefault:!1},{id:`o3`,model:`o3`,displayName:`o3`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`medium`,description:`o3`}],defaultReasoningEffort:`medium`,isDefault:!1}]}";

const BRIDGE_HELPERS = `async function CDRStickyChatSend(e,t,n){/* ${MARKER}:bridge-fn */try{let mode=null;try{mode=localStorage.getItem(\`cdr-product-mode\`)}catch{}if(mode!==\`chat\`)return!1;let text=\`\`;let inp=n&&n.input;if(typeof inp===\`string\`)text=inp;else if(Array.isArray(inp))text=inp.map(x=>typeof x===\`string\`?x:(x&&(x.text||x.content))||\`\`).filter(Boolean).join(\`\\n\`);else if(inp&&typeof inp===\`object\`){if(typeof inp.text===\`string\`)text=inp.text;else if(Array.isArray(inp.parts))text=inp.parts.filter(x=>typeof x===\`string\`).join(\`\\n\`)}text=String(text||\`\`).trim();if(!text)return!1;let key=String(t||\`\`).includes(\`:\`)?String(t):\`local:\`+t;let writeExtra=turn=>{try{let k=\`cdr-thread-extras:\`+key;let arr=JSON.parse(localStorage.getItem(k)||\`[]\`);if(!Array.isArray(arr))arr=[];arr.push({...turn,ts:turn.ts||Date.now(),source:turn.source||\`chat\`});localStorage.setItem(k,JSON.stringify(arr.slice(-200)));try{window.dispatchEvent(new CustomEvent(\`cdr-thread-extras-change\`,{detail:{key}}))}catch{}}catch{}};writeExtra({role:\`user\`,text:text.slice(0,8000),source:\`chat\`});let client=globalThis.__cdrChatClient;if(!client||typeof client.startCompletionStream!==\`function\`){writeExtra({role:\`assistant\`,text:\`[Chat bridge] ChatGPT client not ready yet. Open the ChatGPT home composer once to warm the client, then retry in this thread.\`,source:\`chat-error\`});return!0}let model=(n&&(n.model||n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model))||\`gpt-5.6-sol\`;let effort=(n&&(n.effort||n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.reasoning_effort))||\`high\`;if(effort===\`none\`)effort=void 0;let history=[];try{let extras=JSON.parse(localStorage.getItem(\`cdr-thread-extras:\`+key)||\`[]\`);if(Array.isArray(extras))for(let x of extras.slice(-30)){if(x&&x.text)history.push({role:x.role===\`user\`?\`user\`:\`assistant\`,text:String(x.text).slice(0,4000)})}}catch{}let seed=history.length>1?history.slice(0,-1).map(x=>(x.role===\`user\`?\`User\`:\`Assistant\`)+\`: \`+x.text).join(\`\\n\\n---\\n\\n\`).slice(0,20000):\`\`;let prompt=seed?\`Continuing this Codex Desktop thread. Prior context:\\n\\n\`+seed+\`\\n\\n---\\n\\nUser: \`+text:text;let map={};try{map=JSON.parse(localStorage.getItem(\`cdr-thread-map\`)||\`{}\`)||{}}catch{}let byLocal=map.byLocal&&typeof map.byLocal===\`object\`?map.byLocal:{};let convId=byLocal[key]||null;let msgId=(crypto.randomUUID&&crypto.randomUUID())||String(Date.now());let parentId=(crypto.randomUUID&&crypto.randomUUID())||String(Date.now()+1);let assistant=\`\`;let seenConv=convId;await new Promise((resolve,reject)=>{try{client.startCompletionStream({request:{action:\`next\`,client_prepare_state:\`sent\`,conversation_id:convId||void 0,messages:[{author:{role:\`user\`},content:{content_type:\`text\`,parts:[prompt]},id:msgId,metadata:{}}],model:model,parent_message_id:convId?void 0:parentId,thinking_effort:effort,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,timezone_offset_min:new Date().getTimezoneOffset()},onUpdate:u=>{try{if(!u)return;if(typeof u===\`string\`){assistant+=u;return}if(typeof u.text===\`string\`)assistant+=u.text;else if(typeof u.delta===\`string\`)assistant+=u.delta;else if(u.message&&typeof u.message.content===\`string\`)assistant+=u.message.content;else if(Array.isArray(u.parts))assistant+=u.parts.filter(x=>typeof x===\`string\`).join(\`\`)}catch{}},onEvent:ev=>{try{let d=ev&&ev.data;if(!d)return;if(typeof d===\`string\`){try{d=JSON.parse(d)}catch{return}}let cid=d.conversation_id||d.conversationId;if(cid)seenConv=cid;let parts=[];if(d.message&&d.message.content&&Array.isArray(d.message.content.parts))parts=d.message.content.parts;else if(d.v&&typeof d.v===\`string\`)parts=[d.v];else if(typeof d.o===\`string\`&&d.o.length)parts=[d.o];for(let p of parts)if(typeof p===\`string\`&&p)assistant+=p}catch{}},onComplete:()=>resolve(),onError:err=>reject(err&&err.error?err.error:err)})}catch(err){reject(err)}});assistant=String(assistant||\`\`).trim()||\`(empty ChatGPT response)\`;writeExtra({role:\`assistant\`,text:assistant.slice(0,16000),source:\`chat\`});if(seenConv){try{let m=JSON.parse(localStorage.getItem(\`cdr-thread-map\`)||\`{}\`)||{};m.byLocal=m.byLocal&&typeof m.byLocal===\`object\`?m.byLocal:{};m.byChat=m.byChat&&typeof m.byChat===\`object\`?m.byChat:{};m.byLocal[key]=seenConv;m.byChat[seenConv]=key;localStorage.setItem(\`cdr-thread-map\`,JSON.stringify(m))}catch{}}return!0}catch(err){try{let key=String(t||\`\`).includes(\`:\`)?String(t):\`local:\`+t;let k=\`cdr-thread-extras:\`+key;let arr=JSON.parse(localStorage.getItem(k)||\`[]\`);arr.push({role:\`assistant\`,text:\`[Chat bridge error] \`+String(err&&err.message||err).slice(0,2000),source:\`chat-error\`,ts:Date.now()});localStorage.setItem(k,JSON.stringify(arr.slice(-200)));window.dispatchEvent(new CustomEvent(\`cdr-thread-extras-change\`,{detail:{key}}))}catch{}return!0}}`;

function patchPage(src) {
  let out = src;
  out = out.split("codex-rebuild:codex-rebuild:").join("codex-rebuild:");

  if (out.includes(MARKER + ":mode")) {
    console.log("page already v43");
    return out;
  }

  const old =
    "let CDROnLocal=!!am(`/local/:conversationId`),CDROnRemote=!!am(`/remote/:conversationId`);(0,BI.useLayoutEffect)(()=>{/* codex-rebuild:chat-usage-v42:sync */if(CDRMode===`chat`){if(CDROnLocal||CDROnRemote){try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}a(`/`,{replace:!0,state:{chatGptProjectId:null,chatGptProjectName:null,focusComposerNonce:Date.now()}})}else{try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,CDROnLocal,CDROnRemote,r,i,a,s]);u=e=>{/* codex-rebuild:chat-usage-v42:mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}a(`/`,{replace:!0,state:{chatGptProjectId:null,chatGptProjectName:null,focusComposerNonce:Date.now()}});return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};";

  const neu =
    "(0,BI.useLayoutEffect)(()=>{/* " +
    MARKER +
    ":sync */if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s]);u=e=>{/* " +
    MARKER +
    ":mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext)};";

  assert(out.includes(old), "v42 page block missing — inspect anchors");
  return replaceOnce(out, old, neu, "sticky mode restore");
}

function patchSettings(src) {
  let out = src;
  if (out.includes(MARKER + ":picker")) {
    console.log("settings already v43 picker");
    return out;
  }

  // Inject helpers once near mk
  if (!out.includes("function CDRChatPowerSelections(")) {
    out = replaceOnce(
      out,
      "function mk({conversationId:e,hideLabel:t,permissionsCwdOverride:i,permissionsHostId:a}){/* codex-rebuild:local-canonical-model-picker-v5 */",
      "function mk({conversationId:e,hideLabel:t,permissionsCwdOverride:i,permissionsHostId:a}){/* codex-rebuild:local-canonical-model-picker-v5 */" +
        CHAT_HELPERS +
        "/* " +
        MARKER +
        ":helpers */",
      "chat helpers",
    );
  }

  // Ensure CDRMode subscribe exists (v41 already added it)
  assert(
    out.includes("let[CDRMode,CDRSetMode]=(0,_k.useState)(()=>CDRRuntime.mode())"),
    "CDRMode subscribe missing",
  );

  // y curated for chat
  if (out.includes("y=_?.models,{modelSettings:S")) {
    out = replaceOnce(
      out,
      "{data:_,status:v}=Ga({hostId:f.hostId}),y=_?.models,{modelSettings:S",
      "{data:_,status:v}=Ga({hostId:f.hostId}),y=CDRMode===`chat`?CDRChatModelsForPicker():_?.models/* " +
        MARKER +
        ":y */,{modelSettings:S",
      "chat y",
    );
  } else if (!out.includes(MARKER + ":y")) {
    throw new Error("y=_?.models anchor missing");
  }

  // te discrete for chat
  out = replaceOnce(
    out,
    "te=Cg(y,l),ne=Ug(y)/* codex-rebuild:chat-usage-v41:picker-clean */",
    "te=CDRMode===`chat`?CDRChatPowerSelections():Cg(y,l),ne=Ug(y)/* " +
      MARKER +
      ":picker */",
    "chat te",
  );

  return out;
}

function patchChatClient(src) {
  let out = src;
  if (out.includes(MARKER + ":publish-client")) {
    console.log("chat client already published");
    return out;
  }
  out = replaceOnce(
    out,
    "async startCompletionStream({onComplete:e,onError:t,onEvent:n,onRecoverableError:r,onResponse:i,onRequestStart:a,onTiming:o,onUpdate:s,prepared:c,request:l}){let u=``,d=this.createCompletionStreamHandlers({onComplete:e,onError:t,onEvent:n,onRecoverableError:r,onUpdate:s,requestId:()=>u})",
    "async startCompletionStream({onComplete:e,onError:t,onEvent:n,onRecoverableError:r,onResponse:i,onRequestStart:a,onTiming:o,onUpdate:s,prepared:c,request:l}){try{globalThis.__cdrChatClient=this}catch{}/* " +
      MARKER +
      ":publish-client */let u=``,d=this.createCompletionStreamHandlers({onComplete:e,onError:t,onEvent:n,onRecoverableError:r,onUpdate:s,requestId:()=>u})",
    "publish chat client",
  );
  return out;
}

function patchSend(src) {
  let out = src;
  if (out.includes(MARKER + ":bridge-hook")) {
    console.log("send already bridged");
    return out;
  }

  // Inject helpers before oD
  if (!out.includes("async function CDRStickyChatSend(")) {
    out = replaceOnce(
      out,
      "async function oD(e,t,n){/* codex-rebuild:usage-guard-v1 */",
      BRIDGE_HELPERS +
        "async function oD(e,t,n){/* codex-rebuild:usage-guard-v1 */",
      "inject bridge helpers",
    );
  }

  // After usage guard IIFE call `(t);` insert bridge check.
  // Anchor: end of assertTaskLimitWithoutRuntime IIFE invocation
  const guardEnd = "))(t);let{beforeSendRequest:r,inheritThreadSettings:i=!0,threadStartKind:a,useAppServerPermissionDefault:o,...s}=n,";
  assert(out.includes(guardEnd), "oD guard end anchor missing");
  out = replaceOnce(
    out,
    guardEnd,
    "))(t);if(await CDRStickyChatSend(e,t,n))return;/* " +
      MARKER +
      ":bridge-hook */let{beforeSendRequest:r,inheritThreadSettings:i=!0,threadStartKind:a,useAppServerPermissionDefault:o,...s}=n,",
    "bridge hook",
  );
  return out;
}

function patchTurnsAtom(src) {
  let out = src;
  if (out.includes(MARKER + ":turns-merge")) {
    console.log("turns atom already merged");
    return out;
  }
  const old =
    "return Fa({conversationRequests:i,hideTodoListItems:!1,mergeBerryDisplayTurnsForPIA:!1,preserveServerUserMessages:!1,conversationTurns:d,hasConversation:r,";
  const neu =
    "return Fa({conversationRequests:i,hideTodoListItems:!1,mergeBerryDisplayTurnsForPIA:!1,preserveServerUserMessages:!1,conversationTurns:(()=>{/* " +
    MARKER +
    ":turns-merge */let base=d||[];try{let key=`local:`+e;let extras=JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`);if(!Array.isArray(extras)||!extras.length)return base;let mapped=extras.map((x,i)=>({id:`cdr-extra-`+i+`-`+(x.ts||i),status:`completed`,turnStartedAtMs:x.ts||Date.now(),items:[{id:`cdr-extra-item-`+i,type:x.role===`user`?`userMessage`:`agentMessage`,text:x.text||``,role:x.role||`assistant`}],cdrSource:x.source||`chat`}));return base.concat(mapped)}catch{return base}})(),hasConversation:r,";
  return replaceOnce(out, old, neu, "turns merge");
}

function patchLocalTick(src) {
  let out = src;

  // Repair broken inject: `let` was placed inside a comma-expression after M=du(e)
  if (out.includes("M=du(e),let[CDRExtrasTick")) {
    const brokenStart = out.indexOf("M=du(e),let[CDRExtrasTick");
    const brokenEnd = out.indexOf("})()),V=B.at(-1)", brokenStart);
    assert(brokenEnd > brokenStart, "broken local end missing");
    const restored =
      "M=du(e),{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l})";
    out =
      out.slice(0, brokenStart) +
      restored +
      out.slice(brokenEnd + "})())".length);
    console.log("repaired broken local inject");
  }

  if (
    out.includes(MARKER + ":extras-tick") &&
    out.includes(MARKER + ":extras-listen") &&
    !out.includes("M=du(e),let[")
  ) {
    console.log("local tick already present");
    return out;
  }

  // Hooks must be statements — inject at Cw body start
  const bodyAnchor =
    "){let _=r(Ai),v=Pi(),y=Qc(),b=(0,Tw.useRef)(null),x=Kc(),S=i(sr,e),C=i(Qr,e);i(Zn,e),i(nr,null);";
  assert(out.includes(bodyAnchor), "Cw body anchor missing");
  if (!out.includes(MARKER + ":extras-listen")) {
    out = replaceOnce(
      out,
      bodyAnchor,
      "){let[CDRExtrasTick,CDRSetExtrasTick]=(0,Tw.useState)(0);(0,Tw.useEffect)(()=>{/* " +
        MARKER +
        ":extras-listen */let h=()=>CDRSetExtrasTick(e=>e+1);window.addEventListener(`cdr-thread-extras-change`,h);return()=>window.removeEventListener(`cdr-thread-extras-change`,h)},[]);let _=r(Ai),v=Pi(),y=Qc(),b=(0,Tw.useRef)(null),x=Kc(),S=i(sr,e),C=i(Qr,e);i(Zn,e),i(nr,null);",
      "Cw extras listen hooks",
    );
  }

  // Expression-safe: only replace the RHS of the destructure
  const rhsOld =
    "{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l})";
  const rhsNew =
    "{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=(()=>{/* " +
    MARKER +
    ":extras-tick */void CDRExtrasTick;let base=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l});try{let key=`local:`+e;let extras=JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`);if(!Array.isArray(extras)||!extras.length)return base;let mapped=extras.map((x,i)=>{let turn={id:`cdr-extra-`+i+`-`+(x.ts||i),status:`completed`,turnStartedAtMs:x.ts||Date.now(),items:[{id:`cdr-extra-item-`+i,type:x.role===`user`?`userMessage`:`agentMessage`,text:x.text||``,role:x.role||`assistant`}],cdrSource:x.source||`chat`};return{physicalTurnIds:[],preserveServerUserMessages:!1,requests:[],turn,turnId:turn.id,turnIndex:1e6+i,turnKey:turn.id,turnSearchKey:turn.id,estimatedHeightPx:96,cdrSource:x.source||`chat`}});return{...base,hasRenderableTurns:!0,hasUserMessage:base.hasUserMessage||extras.some(x=>x.role===`user`),visibleTurnEntries:[...(base.visibleTurnEntries||[]),...mapped],renderEntries:[...(base.renderEntries||[]),...mapped]}}catch{return base}})()";

  if (!out.includes(MARKER + ":extras-tick")) {
    assert(out.includes(rhsOld), "visibleTurnEntries destructure missing after repair");
    out = replaceOnce(out, rhsOld, rhsNew, "extras merge RHS");
  }

  return out;
}

function verify(page, settings, chat, send, turns, local) {
  assert(page.includes(MARKER + ":mode"), "page missing sticky mode");
  assert(page.includes(MARKER + ":sync"), "page missing sticky sync");
  assert(!page.includes("chat-usage-v42"), "v42 still present");
  assert(!page.includes("a(`/`,{replace:!0"), "navigate-away still present");
  assert(settings.includes(MARKER + ":picker"), "picker missing");
  assert(settings.includes("modelLabel:`5.5 Instant`"), "Instant missing");
  assert(settings.includes("modelLabel:`GPT-5.4`"), "5.4 missing");
  assert(chat.includes(MARKER + ":publish-client"), "client publish missing");
  assert(send.includes(MARKER + ":bridge-hook"), "bridge hook missing");
  assert(send.includes("CDRStickyChatSend"), "bridge fn missing");
  assert(turns.includes(MARKER + ":turns-merge"), "turns merge missing");
  assert(local.includes(MARKER + ":extras-listen"), "extras listen missing");
  assert(local.includes(MARKER + ":extras-tick"), "extras tick missing");
  assert(!local.includes("M=du(e),let["), "broken let-in-comma inject still present");
  for (const [label, src] of [
    ["page", page],
    ["settings", settings],
    ["chat", chat],
    ["send", send],
    ["turns", turns],
    ["local", local],
  ]) {
    parseOk(label, src);
  }
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-sticky-chat-v43.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  console.log("packing", packed);
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of LIVE_ASARS) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v43-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest, fs.statSync(dest).size);
  }
}

function updateDurablePatch() {
  const durable = path.join(ROOT, "scripts/patch-local-canonical-mode.js");
  let src = fs.readFileSync(durable, "utf8");
  if (src.includes(MARKER + ":durable")) {
    console.log("durable already notes v43");
    return;
  }
  // Fix selector patch to sticky setMode-only (not navigate-away)
  if (
    src.includes("codex-rebuild:chat-usage-v40:mode") ||
    src.includes("chatGptProjectId:null")
  ) {
    const oldSync =
      'controller = replaceOne(\n    controller,\n    "c=p(zT)===`allowed`,l=!n,u;",\n    "c=p(zT)===`allowed`,l=!n,u;(0,BI.useLayoutEffect)(()=>{/* codex-rebuild:chat-usage-v40:sync */if(CDRMode===`chat`){try{let p=location.pathname||``;if(p.startsWith(`/local`)||p.startsWith(`/remote`))a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}})}catch{}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,r,i,a,s]);",\n    "Chat→ChatGPT / Work→work / Codex→codex surface sync",\n  );';
    const neuSync =
      'controller = replaceOne(\n    controller,\n    "c=p(zT)===`allowed`,l=!n,u;",\n    "c=p(zT)===`allowed`,l=!n,u;(0,BI.useLayoutEffect)(()=>{/* ' +
      MARKER +
      ':durable-sync */if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s]);",\n    "Keep native surface on codex so /local sticky history stays",\n  );';
    const oldMode =
      'controller = replaceOne(\n    controller,\n    "t[0]!==a||t[1]!==r||t[2]!==i||t[3]!==s?(u=e=>{sae(i,{currentMode:r,navigate:a,nextMode:e,startNewConversation:s})},t[0]=a,t[1]=r,t[2]=i,t[3]=s,t[4]=u):u=t[4];",\n    "u=e=>{/* codex-rebuild:chat-usage-v40:mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}});return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};",\n    "Chat uses ChatGPT home; Work/Codex use native surfaces",\n  );';
    const neuMode =
      'controller = replaceOne(\n    controller,\n    "t[0]!==a||t[1]!==r||t[2]!==i||t[3]!==s?(u=e=>{sae(i,{currentMode:r,navigate:a,nextMode:e,startNewConversation:s})},t[0]=a,t[1]=r,t[2]=i,t[3]=s,t[4]=u):u=t[4];",\n    "u=e=>{/* ' +
      MARKER +
      ':durable-mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext)};",\n    "Sticky presets: mode switch only flips CDR sticky mode",\n  );';

    if (src.includes(oldSync)) {
      src = src.replace(oldSync, neuSync);
      src = src.replace(oldMode, neuMode);
      // Fix verify needles
      src = src.replace(
        '    "codex-rebuild:chat-usage-v40:mode",\n    "codex-rebuild:chat-usage-v40:sync",\n    "CDRRuntime.setMode(e)",\n    "mode:CDRMode",\n    "CDRChatItem",\n    "children:`ChatGPT Work`",\n    "chatGptProjectId:null",',
        '    "' +
          MARKER +
          ':durable-mode",\n    "' +
          MARKER +
          ':durable-sync",\n    "CDRRuntime.setMode(e)",\n    "mode:CDRMode",\n    "CDRChatItem",\n    "children:`ChatGPT Work`",',
      );
      src = src.replace(
        "if (countOccurrences(controller, \"sae(\") < 2) {\n    throw new Error(\n      `${relPath(filePath)} must sync Work/Codex surfaces via sae`,\n    );\n  }",
        "if (countOccurrences(controller, \"sae(\") < 1) {\n    throw new Error(\n      `${relPath(filePath)} must keep native surface on codex via sae`,\n    );\n  }",
      );
      fs.writeFileSync(durable, src);
      console.log("updated durable patch-local-canonical-mode.js");
    } else {
      console.log("durable anchors drifted — skipped auto-update");
    }
  }
}

killCodex();

for (const [label, p] of [
  ["PAGE", PAGE],
  ["SETTINGS", SETTINGS],
  ["CHAT", CHAT],
  ["SEND", SEND],
  ["LOCAL", LOCAL],
  ["TURNS", TURNS],
]) {
  assert(fs.existsSync(p), `${label} missing: ${p}`);
}

let page = fs.readFileSync(PAGE, "utf8");
let settings = fs.readFileSync(SETTINGS, "utf8");
let chat = fs.readFileSync(CHAT, "utf8");
let send = fs.readFileSync(SEND, "utf8");
let turns = fs.readFileSync(TURNS, "utf8");
let local = fs.readFileSync(LOCAL, "utf8");

page = patchPage(page);
settings = patchSettings(settings);
chat = patchChatClient(chat);
send = patchSend(send);
turns = patchTurnsAtom(turns);
local = patchLocalTick(local);

verify(page, settings, chat, send, turns, local);

fs.writeFileSync(PAGE, page);
fs.writeFileSync(SETTINGS, settings);
fs.writeFileSync(CHAT, chat);
fs.writeFileSync(SEND, send);
fs.writeFileSync(TURNS, turns);
fs.writeFileSync(LOCAL, local);
console.log("wrote source patches");

updateDurablePatch();

if (process.argv.includes("--check")) {
  console.log("check-only ok");
  process.exit(0);
}

install();
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log(
  "\nSUCCESS — fully quit Codex, reopen.\n" +
    "Sticky: Chat/Work/Codex stay on the same /local/:id thread.\n" +
    "Chat picker: Sol High, Sol Medium, 5.5 Instant, GPT-5.4, o3.\n" +
    "Chat sends use ChatGPT usage (bridged); Work/Codex stay AppServer.",
);
