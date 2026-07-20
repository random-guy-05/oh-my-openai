#!/usr/bin/env node
"use strict";
/**
 * sticky-chat-v45 — REAL fix for Chat send + Chat picker layout
 *
 * ACTUAL send bug (v43):
 *   Chat sticky intercepts oD → needs globalThis.__cdrChatClient.
 *   That was only set inside startCompletionStream (chicken/egg).
 *   On sticky /local the jotai client atom L=()=>new fa is never read,
 *   so client is null → bridge wrote an extras error and returned true,
 *   which BLOCKED AppServer and looked like "message won't send".
 *
 * Fix: eagerly construct/publish the ChatGPT client (fa) via
 *   __cdrEnsureChatClient, call it from the bridge, ChatGPT-only
 *   (NO AppServer fallback). Failures surface in transcript extras.
 *
 * Picker: force Chat out of AppServer "advanced" power-slider layout
 *   (K=false → model-row discrete list) with the older Chat catalog:
 *   5.6 Sol High / 5.6 Sol / 5.5 Instant / GPT-5.4 / o3.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v45";

const CHAT = path.join(
  ASSETS,
  "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
const SEND = path.join(
  ASSETS,
  "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
);
const SETTINGS = path.join(
  ASSETS,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
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
function extractFn(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  assert(start >= 0, `missing ${startNeedle.slice(0, 80)}`);
  let depth = 0,
    started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      started = true;
    } else if (src[i] === "}") {
      depth--;
      if (started && depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error("unclosed " + startNeedle.slice(0, 40));
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

function patchChatClient(src) {
  let out = src;
  if (out.includes(MARKER + ":ensure-client")) {
    console.log("chat client already v45");
    return out;
  }

  // Atom lazily builds ChatGPT client — publish + expose ensure factory
  out = replaceOnce(
    out,
    "L=f(p,()=>new fa)}));",
    "L=f(p,()=>{let c=new fa;try{globalThis.__cdrChatClient=c}catch{}return c});try{globalThis.__cdrEnsureChatClient=()=>{try{if(globalThis.__cdrChatClient&&typeof globalThis.__cdrChatClient.startCompletionStream===`function`)return globalThis.__cdrChatClient;let c=new fa;globalThis.__cdrChatClient=c;return c}catch(e){try{console.error(`[cdr] ensure ChatGPT client failed`,e)}catch{}return null}}}catch{}/* codex-rebuild:sticky-chat-v45:ensure-client */}));",
    "ensure ChatGPT client factory",
  );

  // Also publish on models() so any catalog fetch warms the same instance path
  if (!out.includes(MARKER + ":publish-models")) {
    out = replaceOnce(
      out,
      "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v41:merge */",
      "async models(){try{globalThis.__cdrChatClient=this}catch{}/* " +
        MARKER +
        ":publish-models */return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v41:merge */",
      "publish on models",
    );
  }

  return out;
}

const NEW_BRIDGE = (
  "async function CDRStickyChatSend(e,t,n){/* " +
  MARKER +
  ":bridge-fn */" +
  "try{" +
  "let mode=null;try{mode=localStorage.getItem(`cdr-product-mode`)}catch{}" +
  "if(mode!==`chat`)return!1;" +
  "function CDRExtractText(inp){" +
  "if(inp==null)return``;" +
  "if(typeof inp===`string`)return inp;" +
  "if(Array.isArray(inp))return inp.map(CDRExtractText).filter(Boolean).join(`\\n`);" +
  "if(typeof inp===`object`){" +
  "if(typeof inp.text===`string`)return inp.text;" +
  "if(typeof inp.content===`string`)return inp.content;" +
  "if(Array.isArray(inp.parts))return inp.parts.map(CDRExtractText).filter(Boolean).join(`\\n`);" +
  "if(Array.isArray(inp.content))return inp.content.map(CDRExtractText).filter(Boolean).join(`\\n`);" +
  "}" +
  "return``;" +
  "}" +
  "let text=String(CDRExtractText(n&&n.input)||``).trim();" +
  "if(!text)return!1;" +
  "let key=String(t||``).includes(`:`)?String(t):`local:`+t;" +
  "let writeExtra=turn=>{try{" +
  "let k=`cdr-thread-extras:`+key;" +
  "let arr=JSON.parse(localStorage.getItem(k)||`[]`);" +
  "if(!Array.isArray(arr))arr=[];" +
  "arr.push({...turn,ts:turn.ts||Date.now(),source:turn.source||`chat`});" +
  "localStorage.setItem(k,JSON.stringify(arr.slice(-200)));" +
  "try{window.dispatchEvent(new CustomEvent(`cdr-thread-extras-change`,{detail:{key}}))}catch{}" +
  "}catch{}};" +
  "let client=globalThis.__cdrChatClient;" +
  "if(!client||typeof client.startCompletionStream!==`function`){" +
  "try{client=globalThis.__cdrEnsureChatClient&&globalThis.__cdrEnsureChatClient()}catch{client=null}" +
  "}" +
  "if(!client||typeof client.startCompletionStream!==`function`){" +
  "writeExtra({role:`user`,text:text.slice(0,8000),source:`chat`});" +
  "writeExtra({role:`assistant`,text:`[Chat] Could not create the ChatGPT client. Chat mode only sends via ChatGPT Chat usage — message was not sent.`,source:`chat-error`});" +
  "return!0;" +
  "}" +
  "writeExtra({role:`user`,text:text.slice(0,8000),source:`chat`});" +
  "let model=(n&&(n.model||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model)))||`gpt-5.6-sol`;" +
  "let effort=(n&&(n.effort||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.reasoning_effort)))||`high`;" +
  "if(effort===`none`||effort===`minimal`)effort=void 0;" +
  "let history=[];" +
  "try{" +
  "let extras=JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`);" +
  "if(Array.isArray(extras))for(let x of extras.slice(-30)){" +
  "if(x&&x.text&&x.source!==`chat-error`)history.push({role:x.role===`user`?`user`:`assistant`,text:String(x.text).slice(0,4000)});" +
  "}" +
  "}catch{}" +
  "if(history.length&&history[history.length-1].role===`user`)history=history.slice(0,-1);" +
  "let seed=history.length?history.map(x=>(x.role===`user`?`User`:`Assistant`)+`: `+x.text).join(`\\n\\n---\\n\\n`).slice(0,20000):``;" +
  "let prompt=seed?`Continuing this Codex Desktop thread. Prior context:\\n\\n`+seed+`\\n\\n---\\n\\nUser: `+text:text;" +
  "let msgId=(crypto.randomUUID&&crypto.randomUUID())||String(Date.now());" +
  "let parentId=(crypto.randomUUID&&crypto.randomUUID())||String(Date.now()+1);" +
  "let assistant=``;" +
  "let seenConv=null;" +
  "try{" +
  "await new Promise((resolve,reject)=>{" +
  "let settled=!1;" +
  "let timer=setTimeout(()=>{if(!settled){settled=!0;reject(new Error(`ChatGPT stream timed out after 90s`))}},9e4);" +
  "let done=fn=>e=>{if(settled)return;settled=!0;clearTimeout(timer);fn(e)};" +
  "try{" +
  "client.startCompletionStream({" +
  "request:{" +
  "action:`next`," +
  "client_prepare_state:`sent`," +
  "messages:[{author:{role:`user`},content:{content_type:`text`,parts:[prompt]},id:msgId,metadata:{}}]," +
  "model:model," +
  "parent_message_id:parentId," +
  "thinking_effort:effort," +
  "timezone:Intl.DateTimeFormat().resolvedOptions().timeZone," +
  "timezone_offset_min:new Date().getTimezoneOffset()" +
  "}," +
  "onUpdate:u=>{try{" +
  "if(!u)return;" +
  "if(typeof u===`string`){assistant+=u;return}" +
  "if(typeof u.text===`string`)assistant+=u.text;" +
  "else if(typeof u.delta===`string`)assistant+=u.delta;" +
  "else if(u.message&&typeof u.message.content===`string`)assistant+=u.message.content;" +
  "else if(Array.isArray(u.parts))assistant+=u.parts.filter(x=>typeof x===`string`).join(``);" +
  "}catch{}}," +
  "onEvent:ev=>{try{" +
  "let d=ev&&ev.data;if(!d)return;" +
  "if(typeof d===`string`){try{d=JSON.parse(d)}catch{return}}" +
  "let cid=d.conversation_id||d.conversationId;if(cid)seenConv=cid;" +
  "if(typeof d.o===`string`&&d.o)assistant+=d.o;" +
  "if(typeof d.v===`string`&&d.v)assistant+=d.v;" +
  "let parts=d.message&&d.message.content&&d.message.content.parts;" +
  "if(Array.isArray(parts))for(let p of parts)if(typeof p===`string`&&p)assistant+=p;" +
  "}catch{}}," +
  "onComplete:done(()=>resolve())," +
  "onError:done(err=>reject(err&&err.error?err.error:err))" +
  "});" +
  "}catch(err){done(reject)(err)}" +
  "});" +
  "}catch(err){" +
  "writeExtra({role:`assistant`,text:`[Chat] `+String(err&&err.message||err).slice(0,2000),source:`chat-error`});" +
  "return!0;" +
  "}" +
  "assistant=String(assistant||``).trim()||`(empty ChatGPT response)`;" +
  "writeExtra({role:`assistant`,text:assistant.slice(0,16000),source:`chat`});" +
  "if(seenConv){try{" +
  "let m=JSON.parse(localStorage.getItem(`cdr-thread-map`)||`{}`)||{};" +
  "m.byLocal=m.byLocal&&typeof m.byLocal===`object`?m.byLocal:{};" +
  "m.byChat=m.byChat&&typeof m.byChat===`object`?m.byChat:{};" +
  "m.byLocal[key]=seenConv;m.byChat[seenConv]=key;" +
  "localStorage.setItem(`cdr-thread-map`,JSON.stringify(m));" +
  "}catch{}}" +
  "return!0;" +
  "}catch(err){" +
  "try{console.error(`[cdr] Chat bridge crashed`,err)}catch{}" +
  "return!0;" +
  "}}"
);
function patchSend(src) {
  let out = src;
  if (out.includes(MARKER + ":bridge-fn")) {
    console.log("send already v45");
    return out;
  }
  assert(out.includes("async function CDRStickyChatSend(e,t,n){"), "v43 bridge missing");
  const old = extractFn(out, "async function CDRStickyChatSend(e,t,n){");
  out = out.slice(0, old.start) + NEW_BRIDGE + out.slice(old.end);
  assert(out.includes("if(await CDRStickyChatSend(e,t,n))return"), "hook missing");
  return out;
}

function patchPicker(src) {
  let out = src;
  if (out.includes(MARKER + ":picker-layout")) {
    console.log("picker already v45");
    return out;
  }

  // Update discrete Chat power list to older Chat-style labels
  const oldHelpers =
    "function CDRChatPowerSelections(){return[{id:`gpt-5.6-sol:high`,model:`gpt-5.6-sol`,modelLabel:`Sol High`,reasoningEffort:`high`,powerSettingIndex:0},{id:`gpt-5.6-sol:medium`,model:`gpt-5.6-sol`,modelLabel:`Sol Medium`,reasoningEffort:`medium`,powerSettingIndex:1},{id:`gpt-5.5:none`,model:`gpt-5.5`,modelLabel:`5.5 Instant`,reasoningEffort:`none`,powerSettingIndex:2},{id:`gpt-5.4:medium`,model:`gpt-5.4`,modelLabel:`GPT-5.4`,reasoningEffort:`medium`,powerSettingIndex:3},{id:`o3:medium`,model:`o3`,modelLabel:`o3`,reasoningEffort:`medium`,powerSettingIndex:4}]}function CDRChatModelsForPicker(){return[{id:`gpt-5.6-sol`,model:`gpt-5.6-sol`,displayName:`Sol`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`high`,description:`Sol High`},{reasoningEffort:`medium`,description:`Sol Medium`}],defaultReasoningEffort:`high`,isDefault:!0},{id:`gpt-5.5`,model:`gpt-5.5`,displayName:`5.5 Instant`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`none`,description:`5.5 Instant`}],defaultReasoningEffort:`none`,isDefault:!1},{id:`gpt-5.4`,model:`gpt-5.4`,displayName:`GPT-5.4`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`medium`,description:`GPT-5.4`}],defaultReasoningEffort:`medium`,isDefault:!1},{id:`o3`,model:`o3`,displayName:`o3`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`medium`,description:`o3`}],defaultReasoningEffort:`medium`,isDefault:!1}]}";

  // Accept either v43 helpers (with GPT-5.4) or shorter v39 (without)
  if (out.includes("function CDRChatPowerSelections()")) {
    const start = out.indexOf("function CDRChatPowerSelections()");
    const endMarker = out.indexOf("function CDRChatModelsForPicker()");
    assert(endMarker > start, "CDRChatModelsForPicker missing");
    // find end of CDRChatModelsForPicker
    const modelsFn = extractFn(out, "function CDRChatModelsForPicker(){");
    const newHelpers =
      "function CDRChatPowerSelections(){return[{id:`gpt-5.6-sol:high`,model:`gpt-5.6-sol`,modelLabel:`5.6 Sol High`,reasoningEffort:`high`,powerSettingIndex:0},{id:`gpt-5.6-sol:medium`,model:`gpt-5.6-sol`,modelLabel:`5.6 Sol`,reasoningEffort:`medium`,powerSettingIndex:1},{id:`gpt-5.5:none`,model:`gpt-5.5`,modelLabel:`5.5 Instant`,reasoningEffort:`none`,powerSettingIndex:2},{id:`gpt-5.4:medium`,model:`gpt-5.4`,modelLabel:`GPT-5.4`,reasoningEffort:`medium`,powerSettingIndex:3},{id:`o3:medium`,model:`o3`,modelLabel:`o3`,reasoningEffort:`medium`,powerSettingIndex:4}]}/* " +
      MARKER +
      ":helpers */function CDRChatModelsForPicker(){return[{id:`gpt-5.6-sol`,model:`gpt-5.6-sol`,displayName:`5.6 Sol`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`high`,description:`5.6 Sol High`},{reasoningEffort:`medium`,description:`5.6 Sol`}],defaultReasoningEffort:`high`,isDefault:!0},{id:`gpt-5.5`,model:`gpt-5.5`,displayName:`5.5 Instant`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`none`,description:`5.5 Instant`}],defaultReasoningEffort:`none`,isDefault:!1},{id:`gpt-5.4`,model:`gpt-5.4`,displayName:`GPT-5.4`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`medium`,description:`GPT-5.4`}],defaultReasoningEffort:`medium`,isDefault:!1},{id:`o3`,model:`o3`,displayName:`o3`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`medium`,description:`o3`}],defaultReasoningEffort:`medium`,isDefault:!1}]}";
    out = out.slice(0, start) + newHelpers + out.slice(modelsFn.end);
  } else {
    throw new Error("CDRChatPowerSelections missing — run sticky-chat-v43 picker first");
  }

  // Force Chat out of advanced power-slider layout → discrete model-row UI
  const kOld = "K=g&&te.length>=4&&!V&&v!==`error`";
  assert(out.includes(kOld), "picker K anchor missing");
  out = replaceOnce(
    out,
    kOld,
    "K=CDRMode===`chat`?!1:g&&te.length>=4&&!V&&v!==`error`/* " +
      MARKER +
      ":picker-layout */",
    "force chat model-row layout",
  );

  return out;
}

function verify(chat, send, settings) {
  assert(chat.includes(MARKER + ":ensure-client"), "ensure-client missing");
  assert(chat.includes("__cdrEnsureChatClient"), "ensure factory missing");
  assert(send.includes(MARKER + ":bridge-fn"), "bridge missing");
  assert(send.includes("__cdrEnsureChatClient"), "bridge must call ensure");
  assert(!send.includes("falling back to AppServer"), "must NOT fall back to AppServer");
  assert(
    send.includes("Chat mode only sends via ChatGPT Chat usage"),
    "must keep Chat-only error",
  );
  assert(settings.includes(MARKER + ":picker-layout"), "picker layout missing");
  assert(settings.includes("modelLabel:`5.6 Sol High`"), "old Sol High label missing");
  assert(settings.includes("modelLabel:`5.6 Sol`"), "old Sol label missing");
  assert(settings.includes("modelLabel:`5.5 Instant`"), "Instant missing");
  assert(settings.includes("K=CDRMode===`chat`?!1:"), "K force missing");
  parseOk("chat", chat);
  parseOk("send", send);
  parseOk("settings", settings);
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-sticky-chat-v45.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  console.log("packing");
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of LIVE_ASARS) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v45-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
assert(fs.existsSync(CHAT) && fs.existsSync(SEND) && fs.existsSync(SETTINGS), "assets missing");

let chat = fs.readFileSync(CHAT, "utf8");
let send = fs.readFileSync(SEND, "utf8");
let settings = fs.readFileSync(SETTINGS, "utf8");

chat = patchChatClient(chat);
send = patchSend(send);
settings = patchPicker(settings);

verify(chat, send, settings);

fs.writeFileSync(CHAT, chat);
fs.writeFileSync(SEND, send);
fs.writeFileSync(SETTINGS, settings);
console.log("wrote patches");

if (process.argv.includes("--check")) process.exit(0);

install();
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log(
  "\nSUCCESS — fully quit Codex, reopen.\n" +
    "Diagnosis was: Chat bridge blocked sends because ChatGPT client was never constructed on /local.\n" +
    "Now Chat constructs the real ChatGPT client and sends via Chat usage only.\n" +
    "Picker: discrete Chat model-row list (5.6 Sol High / 5.6 Sol / 5.5 Instant / …), not Codex power slider.",
);
