#!/usr/bin/env node
"use strict";
/**
 * v50: Stop "Error creating chat / reading 'turn'" on SEND — no feature removal.
 *
 * Root cause (confirmed in oxnpxkxc oD):
 *   After `turn/start`, native code does `n.turn.id` / `n.turn.status` with no guard.
 *   If Chat bridge does not intercept (mode miss) OR AppServer returns a payload
 *   without `.turn`, that throws exactly:
 *     Cannot read properties of undefined (reading 'turn')
 *   Composer wraps it via Bo→Ho→Fo as "Error creating chat".
 *
 * Keep: sticky /local, ChatGPT usage bridge, discrete picker, extras transcript overlay.
 *
 * Fix:
 * 1) Guard turn/start response before reading n.turn
 * 2) Make Chat bridge mode detection robust (localStorage + DOM + runtime)
 * 3) Defer extras-change event so sync re-entry cannot blow up submit
 * 4) Keep UI extras-tick + existing harden seatbelts
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v50";

const SEND = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("oxnpxkxc") && f.endsWith(".js")),
);
const LOCAL = path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js");

const LIVE = [
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
  assert(n === 1, `${label}: expected 1 got ${n}`);
  return src.replace(from, to);
}
function parseOk(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (err) {
    throw new Error(`${label}: ${err.message}`);
  }
}
function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|Codex\.payload/.test(line)) continue;
      if (/cursor-agent|grep|sticky-chat|_apply-|clear-cdr|release-live/.test(line))
        continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}
function extractFn(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  assert(start >= 0, "missing " + startNeedle.slice(0, 60));
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

const NEW_BRIDGE =
  "async function CDRStickyChatSend(e,t,n){/* " +
  MARKER +
  ":bridge-fn */" +
  "try{" +
  "function CDRChatMode(){" +
  "try{let m=localStorage.getItem(`cdr-product-mode`);if(m!=null){m=String(m).replace(/^[\"']|[\"']$/g,``);if(m===`chat`)return!0}}" +
  "catch{}" +
  "try{if(document.documentElement.getAttribute(`data-codex-product-mode`)===`chat`)return!0}catch{}" +
  "try{if(globalThis.__cdrLocalModeV4&&typeof globalThis.__cdrLocalModeV4.mode===`function`&&globalThis.__cdrLocalModeV4.mode()===`chat`)return!0}catch{}" +
  "return!1" +
  "}" +
  "if(!CDRChatMode())return!1;" +
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
  // defer event so submit stack cannot sync-reenter React and blow up
  "try{queueMicrotask(()=>{try{window.dispatchEvent(new CustomEvent(`cdr-thread-extras-change`,{detail:{key}}))}catch{}})}catch{try{window.dispatchEvent(new CustomEvent(`cdr-thread-extras-change`,{detail:{key}}))}catch{}}" +
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
  "}}";

function patchSend(src) {
  let out = src;
  assert(out.includes("async function CDRStickyChatSend(e,t,n){"), "bridge missing");
  const old = extractFn(out, "async function CDRStickyChatSend(e,t,n){");
  out = out.slice(0, old.start) + NEW_BRIDGE + out.slice(old.end);

  // Guard turn/start response — THE send crash
  const bad =
    "return e.updateConversationState(t,e=>{let t=lD(e,c,n.turn.id);t&&(t.turnId=n.turn.id,t.items||=[],t.status===`inProgress`&&(t.status=n.turn.status)),o!=null&&(a==null?h??(e.workspaceKind=`project`):e.workspaceKind=a.project==null?`projectless`:`project`,e.workspaceBrowserRoot=null,e.cwd=o.cwd),e.currentPermissions=R}),n}";
  assert(out.includes(bad) || out.includes(MARKER + ":guard-turn-start"), "turn/start update anchor missing");
  if (out.includes(bad)) {
    const good =
      "if(!n||!n.turn||n.turn.id==null){/* " +
      MARKER +
      ":guard-turn-start */throw n&&n.error?n.error:new Error(`turn/start returned no turn`)}return e.updateConversationState(t,e=>{let t=lD(e,c,n.turn.id);t&&(t.turnId=n.turn.id,t.items||=[],t.status===`inProgress`&&(t.status=n.turn.status)),o!=null&&(a==null?h??(e.workspaceKind=`project`):e.workspaceKind=a.project==null?`projectless`:`project`,e.workspaceBrowserRoot=null,e.cwd=o.cwd),e.currentPermissions=R}),n}";
    out = replaceOnce(out, bad, good, "guard turn/start response");
  }

  assert(out.includes("if(await CDRStickyChatSend(e,t,n))"), "bridge hook missing");
  return out;
}

function patchLocal(src) {
  let out = src;
  // Ensure empty extras path never mutates; keep v49 tick if present, just mark v50 seatbelt
  if (!out.includes(MARKER + ":extras-safe")) {
    // After V=B.at(-1), gS uses al.visibleTurnEntries ungarded — sanitize that call
    const old =
      "let H=O==null?null:gS(_.get(al,{conversationId:e,isBackgroundSubagentsEnabled:l}).visibleTurnEntries,O.updatedAt*1e3)";
    if (out.includes(old)) {
      out = replaceOnce(
        out,
        old,
        "let H=O==null?null:gS((_.get(al,{conversationId:e,isBackgroundSubagentsEnabled:l}).visibleTurnEntries||[]).filter(e=>e&&e.turn),O.updatedAt*1e3)/* " +
          MARKER +
          ":extras-safe */",
        "sanitize gS input",
      );
    }
  }
  return out;
}

function verify(send, local) {
  assert(send.includes(MARKER + ":bridge-fn"), "bridge missing");
  assert(send.includes("CDRChatMode"), "mode helper missing");
  assert(send.includes(MARKER + ":guard-turn-start"), "turn/start guard missing");
  assert(send.includes("queueMicrotask"), "deferred extras event missing");
  assert(!send.includes("lD(e,c,n.turn.id);t&&(t.turnId=n.turn.id") || send.includes("guard-turn-start"), "unguarded n.turn still present");
  // ungarded pattern should be gone
  assert(
    !send.match(/lD\(e,c,n\.turn\.id\);t&&\(t\.turnId=n\.turn\.id/) ||
      send.indexOf(MARKER + ":guard-turn-start") <
        send.indexOf("lD(e,c,n.turn.id)"),
    "guard must precede n.turn use",
  );
  parseOk("send", send);
  parseOk("local", local);
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-sticky-chat-v50.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  console.log("packing");
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of LIVE) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v50-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

function regressionCheck(send) {
  // Concrete assertions that would have caught this bug
  const o = send.indexOf("async function oD(e,t,n){");
  const chunk = send.slice(o, o + 25000);
  assert(chunk.includes("CDRStickyChatSend"), "regression: bridge not in oD");
  assert(chunk.includes("guard-turn-start"), "regression: no turn/start guard");
  assert(
    /if\(!n\|\|!n\.turn\|\|n\.turn\.id==null\)/.test(chunk),
    "regression: guard condition missing",
  );
  console.log("regression checks passed");
}

killCodex();
let send = fs.readFileSync(SEND, "utf8");
let local = fs.readFileSync(LOCAL, "utf8");
send = patchSend(send);
local = patchLocal(local);
verify(send, local);
regressionCheck(send);
fs.writeFileSync(SEND, send);
fs.writeFileSync(LOCAL, local);
console.log("wrote");

if (process.argv.includes("--check")) process.exit(0);

install();
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});
console.log(
  "\nSUCCESS — Cmd+Q Codex fully, reopen, set mode to Chat, send again.\n" +
    "Fixed: guarded turn/start response + robust Chat bridge intercept.",
);

