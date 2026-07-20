#!/usr/bin/env node
"use strict";
/**
 * Local-canonical Chat↔Codex continuity (v36).
 *
 * - Codex threads stay on /local/:id in every product mode (no ChatGPT handoff-away).
 * - Mode switch only flips sticky mode on an open local thread.
 * - Chat sticky on /local still sends via AppServer (Codex models) so history is shared.
 * - cdr-thread-extras mirrors Chat-origin turns into the local transcript merge.
 * - conversationTurns merges AppServer turns with extras for bidirectional visibility.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const PAGE = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
);
const REMOTE = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js",
);
const QC = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
);
const LOCAL = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-CU8tsPvp.js",
);
const SETTINGS = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~pull-request-route~onboarding-page~settings-page~~iaab4bzx-BHK3miry.js",
);

const MARKER = "codex-rebuild:local-canonical-v36";

function assert(c, m) {
  if (!c) throw new Error(m);
}

function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1 match, got ${n}`);
  return src.replace(from, to);
}

function replaceFirst(src, from, to, label) {
  const i = src.indexOf(from);
  assert(i >= 0, `${label}: anchor not found`);
  return src.slice(0, i) + to + src.slice(i + from.length);
}

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep|local-canonical/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

/** Shared helpers injected into remote Tc and available via globalThis. */
const HELPERS = `function CDRReadThreadMap(){let m={byLocal:{},byChat:{}};try{let cur=JSON.parse(localStorage.getItem(\`cdr-thread-map\`)||\`{}\`);if(cur&&typeof cur===\`object\`){m.byLocal=cur.byLocal&&typeof cur.byLocal===\`object\`?cur.byLocal:{};m.byChat=cur.byChat&&typeof cur.byChat===\`object\`?cur.byChat:{}}let old=JSON.parse(localStorage.getItem(\`cdr-codex-chatgpt-map\`)||\`{}\`);if(old&&typeof old===\`object\`){for(let[k,v]of Object.entries(old)){if(typeof k===\`string\`&&typeof v===\`string\`){if(!m.byLocal[k])m.byLocal[k]=v;if(!m.byChat[v])m.byChat[v]=k}}} }catch{}return m}function CDRWriteThreadMap(localKey,chatId){if(!localKey||!chatId)return;try{let m=CDRReadThreadMap();m.byLocal[localKey]=chatId;m.byChat[chatId]=localKey;localStorage.setItem(\`cdr-thread-map\`,JSON.stringify(m));let old=JSON.parse(localStorage.getItem(\`cdr-codex-chatgpt-map\`)||\`{}\`);old[localKey]=chatId;localStorage.setItem(\`cdr-codex-chatgpt-map\`,JSON.stringify(old))}catch{}}function CDRProductMode(){try{return localStorage.getItem(\`cdr-product-mode\`)}catch{return null}}function CDRLocalKey(t){if(!t)return null;return t.includes(\`:\`)?t:\`local:\`+t}function CDRThreadId(t){if(!t)return null;return t.includes(\`:\`)?t.split(\`:\`).slice(1).join(\`:\`):t}function CDRReadExtras(localKey){try{let k=\`cdr-thread-extras:\`+(localKey||\`\`);let raw=localStorage.getItem(k);let arr=raw?JSON.parse(raw):[];return Array.isArray(arr)?arr:[]}catch{return[]}}function CDRWriteExtra(localKey,turn){if(!localKey||!turn)return;try{let k=\`cdr-thread-extras:\`+localKey;let arr=CDRReadExtras(localKey);arr.push({...turn,ts:turn.ts||Date.now(),source:turn.source||\`chat\`});localStorage.setItem(k,JSON.stringify(arr.slice(-200)))}catch{}}function CDRBuildHistoryTurns(e,t){let out=[];try{let key=CDRLocalKey(t),id=CDRThreadId(key),p=typeof mt===\`function\`?mt(key):null,tid=p?.threadId||id;if(tid!=null&&e&&typeof e.get===\`function\`){let k=e.get(Li,tid),snap=k!=null?e.get(Mn,k):null,turns=snap?.turns||snap?.items||snap?.history||[];if(Array.isArray(turns)){for(let turn of turns){let role=\`assistant\`,texts=[],ts=turn?.turnStartedAtMs||turn?.createdAt||turn?.timestamp||null;let items=Array.isArray(turn?.items)?turn.items:Array.isArray(turn)?turn:[turn];for(let item of items){if(!item||typeof item!==\`object\`)continue;let r=item.role||item.type||item.kind;if(typeof r===\`string\`){if(/user/i.test(r))role=\`user\`;else if(/assistant|agent/i.test(r))role=\`assistant\`}for(let key of[\`text\`,\`content\`,\`agentMessage\`,\`userMessage\`,\`message\`]){let val=item[key];if(typeof val===\`string\`&&val.trim())texts.push(val.trim());else if(Array.isArray(val))for(let c of val){if(typeof c===\`string\`&&c.trim())texts.push(c.trim());else if(c&&typeof c.text===\`string\`&&c.text.trim())texts.push(c.text.trim())}}}if(texts.length)out.push({role,text:texts.join(\`\\n\`).slice(0,8000),ts,source:\`codex\`})}}}for(let x of CDRReadExtras(key)){if(x&&typeof x.text===\`string\`&&x.text.trim())out.push({role:x.role||\`assistant\`,text:x.text.trim().slice(0,8000),ts:x.ts||null,source:x.source||\`chat\`})}}catch{}return out}function CDRBuildCodexSeed(e,t){let turns=CDRBuildHistoryTurns(e,t);if(turns.length){let lines=turns.slice(-40).map(x=>((x.role===\`user\`?\`User\`:\`Assistant\`)+\`: \`)+x.text.slice(0,2000));return \`Continuing this Codex thread. Prior context:\\n\\n\`+lines.join(\`\\n\\n---\\n\\n\`).slice(0,24000)+\`\\n\\nPlease continue from here.\`}return \`Continue Codex thread \${t}. Use prior project context and proceed.\`}try{globalThis.__cdrV36={CDRReadThreadMap,CDRWriteThreadMap,CDRProductMode,CDRLocalKey,CDRThreadId,CDRReadExtras,CDRWriteExtra,CDRBuildHistoryTurns,CDRBuildCodexSeed}}catch{}`;

function extractFunction(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  assert(start >= 0, `missing ${startNeedle.slice(0, 60)}`);
  let i = start;
  let depth = 0;
  let started = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      depth++;
      started = true;
    } else if (c === "}") {
      depth--;
      if (started && depth === 0) return { start, end: i + 1, text: src.slice(start, i + 1) };
    }
  }
  throw new Error(`unclosed function for ${startNeedle.slice(0, 40)}`);
}

function patchRemote(remote) {
  if (remote.includes(MARKER)) {
    console.log("remote already v36");
    return remote;
  }
  const tc = extractFunction(
    remote,
    "function Tc(e,t,n,r){/* codex-rebuild:chat-codex-handoff-v18 */",
  );
  const replacement = `function Tc(e,t,n,r){/* ${MARKER} */${HELPERS};Ec(e,t);let i=mn(t);if(i!=null){n(i);return}r(S(t))}`;
  return remote.slice(0, tc.start) + replacement + remote.slice(tc.end);
}

function patchPage(page) {
  let out = page;

  // Remove cold-start handoff that leaves /local
  const handoffV35 =
    "(0,rz.useEffect)(()=>{/* codex-rebuild:chat-local-handoff-v35 */if(!(CDRSticky===`chat`||CDRChatModeFromRoute)){try{for(let i=sessionStorage.length-1;i>=0;i--){let k=sessionStorage.key(i);if(k&&k.startsWith(`cdr-chat-local-handoff:`))sessionStorage.removeItem(k)}}catch{}return}let p=CDRChatLocation.pathname||``;if(!p.startsWith(`/local/`))return;let id=decodeURIComponent(p.slice(7).split(`?`)[0]||``);if(!id)return;try{let k=`cdr-chat-local-handoff:`+id;if(sessionStorage.getItem(k)===`1`)return;sessionStorage.setItem(k,`1`)}catch{}Aw(a,id.includes(`:`)?id:`local:${id}`,CDROpenLocalThread,CDRChatNavigate)},[CDRSticky,CDRChatModeFromRoute,CDRChatLocation.pathname]);";

  const handoffStay =
    "(0,rz.useEffect)(()=>{/* codex-rebuild:local-canonical-v36-stay */if(!(CDRSticky===`chat`||CDRChatModeFromRoute||CDRSticky===`work`))return;let p=CDRChatLocation.pathname||``;if(!p.startsWith(`/local/`))return;try{for(let i=sessionStorage.length-1;i>=0;i--){let k=sessionStorage.key(i);if(k&&k.startsWith(`cdr-chat-local-handoff:`))sessionStorage.removeItem(k)}}catch{};/* stay on /local — no Aw handoff */},[CDRSticky,CDRChatModeFromRoute,CDRChatLocation.pathname]);";

  if (out.includes("codex-rebuild:local-canonical-v36-stay")) {
    console.log("page stay effect already applied");
  } else if (out.includes(handoffV35)) {
    out = replaceOnce(out, handoffV35, handoffStay, "handoff→stay");
  } else {
    throw new Error("no v35 handoff effect to replace");
  }

  // Mode select: stay on local when flipping chat/work/codex
  const modeOld = extractModeSelect(out);
  const modeNew = modeOld.text
    .replace(
      "if(e===`chat`){if(CDRLocalId){Aw(a,CDRLocalId.includes(`:`)?CDRLocalId:`local:${CDRLocalId}`,CDROpenLocalThread,CDRChatNavigate);return}",
      "if(e===`chat`){if(CDRLocalId){return}",
    )
    .replace(
      "if(e===`work`){if(CDRLocalId){Aw(a,CDRLocalId.includes(`:`)?CDRLocalId:`local:${CDRLocalId}`,CDROpenLocalThread,CDRChatNavigate);return}",
      "if(e===`work`){if(CDRLocalId){return}",
    )
    .replace(
      "if(e===`codex`){if(CDRLocalId){Aw(a,CDRLocalId.includes(`:`)?CDRLocalId:`local:${CDRLocalId}`,CDROpenLocalThread,CDRChatNavigate);return}",
      "if(e===`codex`){if(CDRLocalId){return}",
    );
  assert(modeNew !== modeOld.text, "mode select local Aw branches not updated");
  // mark
  const marked = modeNew.replace(
    "onModeSelect:e=>{let CDRPath=",
    `onModeSelect:e=>{/* ${MARKER} */let CDRPath=`,
  );
  out = out.slice(0, modeOld.start) + marked + out.slice(modeOld.end);
  return out;
}

function extractModeSelect(page) {
  const start = page.indexOf(
    "onModeSelect:e=>{let CDRPath=CDRChatLocation.pathname",
  );
  assert(start >= 0, "onModeSelect not found");
  let depth = 0;
  let started = false;
  for (let i = start; i < page.length; i++) {
    if (page[i] === "{") {
      depth++;
      started = true;
    } else if (page[i] === "}") {
      depth--;
      if (started && depth === 0)
        return { start, end: i + 1, text: page.slice(start, i + 1) };
    }
  }
  throw new Error("unclosed onModeSelect");
}

function patchQc(qc) {
  if (qc.includes("catalog-v36-local")) {
    console.log("qc catalog already v36");
    return qc;
  }
  // On /local routes, even Chat sticky uses Codex-compatible catalog so AppServer send works.
  const old =
    "Ee=(()=>{/* codex-rebuild:catalog-v33 */try{let m=document.documentElement.getAttribute(`data-codex-product-mode`)||localStorage.getItem(`cdr-product-mode`);if(m===`chat`||CDRChatSticky)return pe;if(m===`work`)return ge;if(m===`codex`)return globalThis.__cdrCodexPickerModels||(globalThis.__cdrCodexPickerModels={data:{defaultModelSlug:`gpt-5.6-sol`,options:[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol`,thinkingEffort:`medium`},{description:null,lane:`thinking`,selectedLabel:`Terra High`,slug:`gpt-5.6-terra`,title:`Terra`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Terra Medium`,slug:`gpt-5.6-terra`,title:`Terra`,thinkingEffort:`medium`},{description:null,lane:`thinking`,selectedLabel:`Luna High`,slug:`gpt-5.6-luna`,title:`Luna`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Luna Medium`,slug:`gpt-5.6-luna`,title:`Luna`,thinkingEffort:`medium`}]},isError:!1,isLoading:!1,isFetching:!1,isSuccess:!0,status:`success`});return ue===`tpp`?ge:pe}catch{return CDRChatSticky?pe:ue===`tpp`?ge:pe}})()";

  const neu =
    "Ee=(()=>{/* codex-rebuild:catalog-v36-local */try{let m=document.documentElement.getAttribute(`data-codex-product-mode`)||localStorage.getItem(`cdr-product-mode`);let onLocal=(location.pathname||``).startsWith(`/local/`);let codexModels=globalThis.__cdrCodexPickerModels||(globalThis.__cdrCodexPickerModels={data:{defaultModelSlug:`gpt-5.6-sol`,options:[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol`,thinkingEffort:`medium`},{description:null,lane:`thinking`,selectedLabel:`Terra High`,slug:`gpt-5.6-terra`,title:`Terra`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Terra Medium`,slug:`gpt-5.6-terra`,title:`Terra`,thinkingEffort:`medium`},{description:null,lane:`thinking`,selectedLabel:`Luna High`,slug:`gpt-5.6-luna`,title:`Luna`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Luna Medium`,slug:`gpt-5.6-luna`,title:`Luna`,thinkingEffort:`medium`}]},isError:!1,isLoading:!1,isFetching:!1,isSuccess:!0,status:`success`});if(onLocal)return m===`work`?ge:codexModels;if(m===`chat`||CDRChatSticky)return pe;if(m===`work`)return ge;if(m===`codex`)return codexModels;return ue===`tpp`?ge:pe}catch{return CDRChatSticky?pe:ue===`tpp`?ge:pe}})()";

  return replaceOnce(qc, old, neu, "catalog local-canonical");
}

function patchLocalThread(local) {
  if (local.includes(MARKER)) {
    console.log("local thread already v36");
    return local;
  }
  const old =
    "{turns:m.get(au,{conversationId:e,isBackgroundSubagentsEnabled:o}).conversationTurns}";
  const neu = `{turns:(()=>{/* ${MARKER} */let base=m.get(au,{conversationId:e,isBackgroundSubagentsEnabled:o}).conversationTurns||[];try{let key=\`local:\`+e;let extras=(globalThis.__cdrV36&&globalThis.__cdrV36.CDRReadExtras?globalThis.__cdrV36.CDRReadExtras(key):(()=>{try{return JSON.parse(localStorage.getItem(\`cdr-thread-extras:\`+key)||\`[]\`)}catch{return[]}})());if(!Array.isArray(extras)||!extras.length)return base;let mapped=extras.map((x,i)=>({id:\`cdr-extra-\`+i+\`-\`+(x.ts||i),status:\`completed\`,turnStartedAtMs:x.ts||Date.now(),items:[{id:\`cdr-extra-item-\`+i,type:x.role===\`user\`?\`userMessage\`:\`agentMessage\`,text:x.text||\`\`,role:x.role||\`assistant\`}],cdrSource:x.source||\`chat\`}));return base.concat(mapped)}catch{return base}})()}`;
  return replaceOnce(local, old, neu, "conversationTurns merge");
}

function patchSettings(settings) {
  if (settings.includes("cdr-bridge-v36")) {
    console.log("settings QU already bridged");
    return settings;
  }
  const old = "async function QU(e,t,n){let{beforeSendRequest:r,inheritThreadSettings:i=!0,threadStartKind:a,useAppServerPermissionDefault:o,...s}=n,";
  const neu = `async function QU(e,t,n){/* cdr-bridge-v36 */try{let mode=localStorage.getItem(\`cdr-product-mode\`);if(mode===\`chat\`||mode===\`work\`){let codex=new Set([\`gpt-5.6-sol\`,\`gpt-5.6-terra\`,\`gpt-5.6-luna\`,\`gpt-5.3-codex\`,\`gpt-5.2-codex\`,\`codex-mini\`,\`o3\`,\`o4-mini\`]);let model=n?.model??s?.model;if(model&&!codex.has(model)&&![...codex].some(x=>String(model).startsWith(x))){n={...n,model:\`gpt-5.6-sol\`,effort:n.effort??\`medium\`}}try{let text=\`\`;let inp=n.input??n?.s?.input;if(typeof inp===\`string\`)text=inp;else if(Array.isArray(inp))text=inp.map(x=>typeof x===\`string\`?x:x?.text||x?.content||\`\`).filter(Boolean).join(\`\\n\`);if(text&&t){let key=String(t).includes(\`:\`)?String(t):\`local:\`+t;let fn=globalThis.__cdrV36?.CDRWriteExtra;if(fn)fn(key,{role:\`user\`,text:String(text).slice(0,8000),source:mode,ts:Date.now()});else{let k=\`cdr-thread-extras:\`+key;let arr=JSON.parse(localStorage.getItem(k)||\`[]\`);arr.push({role:\`user\`,text:String(text).slice(0,8000),source:mode,ts:Date.now()});localStorage.setItem(k,JSON.stringify(arr.slice(-200)))}}}catch{}}}catch{}let{beforeSendRequest:r,inheritThreadSettings:i=!0,threadStartKind:a,useAppServerPermissionDefault:o,...s}=n,`;
  // Fix: s is used before destructure in my patch - need to destructure first or use n only
  const neuFixed = `async function QU(e,t,n){/* cdr-bridge-v36 */try{let mode=localStorage.getItem(\`cdr-product-mode\`);if(mode===\`chat\`||mode===\`work\`){let codex=new Set([\`gpt-5.6-sol\`,\`gpt-5.6-terra\`,\`gpt-5.6-luna\`,\`gpt-5.3-codex\`,\`gpt-5.2-codex\`,\`codex-mini\`]);let model=n&&n.model;if(model&&!codex.has(model)){n={...n,model:\`gpt-5.6-sol\`,effort:n.effort??\`medium\`}}try{let text=\`\`;let inp=n&&n.input;if(typeof inp===\`string\`)text=inp;else if(Array.isArray(inp))text=inp.map(x=>typeof x===\`string\`?x:(x&&(x.text||x.content))||\`\`).filter(Boolean).join(\`\\n\`);if(text&&t){let key=String(t).includes(\`:\`)?String(t):\`local:\`+t;try{let k=\`cdr-thread-extras:\`+key;let arr=JSON.parse(localStorage.getItem(k)||\`[]\`);arr.push({role:\`user\`,text:String(text).slice(0,8000),source:mode,ts:Date.now()});localStorage.setItem(k,JSON.stringify(arr.slice(-200)))}catch{}}}catch{}}}catch{}let{beforeSendRequest:r,inheritThreadSettings:i=!0,threadStartKind:a,useAppServerPermissionDefault:o,...s}=n,`;
  return replaceOnce(settings, old, neuFixed, "QU chat bridge");
}

function verify() {
  const page = fs.readFileSync(PAGE, "utf8");
  const remote = fs.readFileSync(REMOTE, "utf8");
  const qc = fs.readFileSync(QC, "utf8");
  const local = fs.readFileSync(LOCAL, "utf8");
  const settings = fs.readFileSync(SETTINGS, "utf8");

  assert(remote.includes(MARKER), "remote missing v36 marker");
  assert(remote.includes("CDRBuildHistoryTurns"), "missing history reader");
  assert(!remote.includes("prefillPrompt:seed,cdrContinueThreadKey"), "old seed handoff still present");
  assert(page.includes("local-canonical-v36-stay"), "page missing stay effect");
  assert(!page.includes("chat-local-handoff-v35"), "old v35 handoff still present");
  assert(page.includes(MARKER), "page mode select missing marker");
  assert(qc.includes("catalog-v36-local"), "qc missing local catalog");
  assert(local.includes(MARKER), "local missing merge marker");
  assert(settings.includes("cdr-bridge-v36"), "settings missing bridge");

  for (const [label, src] of [
    ["page", page],
    ["remote", remote],
    ["qc", qc],
    ["local", local],
    ["settings", settings],
  ]) {
    try {
      acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
    } catch (err) {
      throw new Error(`${label} parse failed: ${err.message}`);
    }
  }
  console.log("verify ok (acorn)");
}

function install() {
  const packed = path.join(ROOT, "out", "app-local-canonical-v36.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of [
    path.join(
      os.homedir(),
      "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
    ),
    "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
  ]) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v36-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

function apply() {
  let remote = fs.readFileSync(REMOTE, "utf8");
  let page = fs.readFileSync(PAGE, "utf8");
  let qc = fs.readFileSync(QC, "utf8");
  let local = fs.readFileSync(LOCAL, "utf8");
  let settings = fs.readFileSync(SETTINGS, "utf8");

  remote = patchRemote(remote);
  page = patchPage(page);
  qc = patchQc(qc);
  local = patchLocalThread(local);
  settings = patchSettings(settings);

  fs.writeFileSync(REMOTE, remote);
  fs.writeFileSync(PAGE, page);
  fs.writeFileSync(QC, qc);
  fs.writeFileSync(LOCAL, local);
  fs.writeFileSync(SETTINGS, settings);
  console.log("wrote patches");
}

killCodex();
apply();
verify();
if (process.argv.includes("--check")) process.exit(0);
install();
console.log("done — resign live runtime if Gatekeeper complains");
