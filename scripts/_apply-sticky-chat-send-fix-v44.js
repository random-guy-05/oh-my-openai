#!/usr/bin/env node
"use strict";
/**
 * v44: Chat sticky send was a no-op.
 *
 * Bridge returned true when __cdrChatClient was missing (never warmed on /local),
 * which blocked AppServer and left the composer hanging with no visible error.
 *
 * Fix:
 * - Publish ChatGPT client from models() (always called) not only startCompletionStream
 * - Extract input items shaped as {type:'text', text}
 * - One-shot ChatGPT conversations with history seed (reliable)
 * - If client missing / stream fails → fall through to AppServer with Sol so send works
 * - 90s timeout so the promise cannot hang forever
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v44";

const CHAT = path.join(
  ASSETS,
  "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
const SEND = path.join(
  ASSETS,
  "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
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

function extractFn(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  assert(start >= 0, `missing ${startNeedle.slice(0, 60)}`);
  let depth = 0,
    started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      started = true;
    } else if (src[i] === "}") {
      depth--;
      if (started && depth === 0) {
        return { start, end: i + 1, text: src.slice(start, i + 1) };
      }
    }
  }
  throw new Error("unclosed fn");
}

const NEW_BRIDGE = `async function CDRStickyChatSend(e,t,n){/* ${MARKER}:bridge-fn */
try{
  let mode=null;try{mode=localStorage.getItem(\`cdr-product-mode\`)}catch{}
  if(mode!==\`chat\`)return!1;

  function CDRExtractText(inp){
    if(inp==null)return\`\`;
    if(typeof inp===\`string\`)return inp;
    if(Array.isArray(inp))return inp.map(CDRExtractText).filter(Boolean).join(\`\\n\`);
    if(typeof inp===\`object\`){
      if(typeof inp.text===\`string\`)return inp.text;
      if(typeof inp.content===\`string\`)return inp.content;
      if(Array.isArray(inp.parts))return inp.parts.map(CDRExtractText).filter(Boolean).join(\`\\n\`);
      if(Array.isArray(inp.content))return inp.content.map(CDRExtractText).filter(Boolean).join(\`\\n\`);
    }
    return\`\`;
  }

  let text=String(CDRExtractText(n&&n.input)||\`\`).trim();
  if(!text)return!1;

  let key=String(t||\`\`).includes(\`:\`)?String(t):\`local:\`+t;
  let writeExtra=turn=>{try{
    let k=\`cdr-thread-extras:\`+key;
    let arr=JSON.parse(localStorage.getItem(k)||\`[]\`);
    if(!Array.isArray(arr))arr=[];
    arr.push({...turn,ts:turn.ts||Date.now(),source:turn.source||\`chat\`});
    localStorage.setItem(k,JSON.stringify(arr.slice(-200)));
    try{window.dispatchEvent(new CustomEvent(\`cdr-thread-extras-change\`,{detail:{key}}))}catch{}
  }catch{}};

  let client=globalThis.__cdrChatClient;
  if(!client||typeof client.startCompletionStream!==\`function\`){
    // Do NOT block send — fall through to AppServer with a Codex-safe model.
    try{
      if(n&&typeof n===\`object\`){
        n.model=\`gpt-5.6-sol\`;
        if(n.effort==null)n.effort=\`medium\`;
        if(n.collaborationMode&&n.collaborationMode.settings){
          n.collaborationMode={...n.collaborationMode,settings:{...n.collaborationMode.settings,model:\`gpt-5.6-sol\`,reasoning_effort:n.collaborationMode.settings.reasoning_effort||\`medium\`}};
        }
      }
    }catch{}
    try{console.warn(\`[cdr] ChatGPT client not ready — falling back to AppServer for this send\`)}catch{}
    return!1;
  }

  writeExtra({role:\`user\`,text:text.slice(0,8000),source:\`chat\`});

  let model=(n&&(n.model||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.model)))||\`gpt-5.6-sol\`;
  let effort=(n&&(n.effort||(n.collaborationMode&&n.collaborationMode.settings&&n.collaborationMode.settings.reasoning_effort)))||\`high\`;
  if(effort===\`none\`||effort===\`minimal\`)effort=void 0;

  let history=[];
  try{
    let extras=JSON.parse(localStorage.getItem(\`cdr-thread-extras:\`+key)||\`[]\`);
    if(Array.isArray(extras))for(let x of extras.slice(-30)){
      if(x&&x.text&&x.source!==\`chat-error\`)history.push({role:x.role===\`user\`?\`user\`:\`assistant\`,text:String(x.text).slice(0,4000)});
    }
  }catch{}
  // Drop the user turn we just wrote from the seed.
  if(history.length&&history[history.length-1].role===\`user\`)history=history.slice(0,-1);
  let seed=history.length?history.map(x=>(x.role===\`user\`?\`User\`:\`Assistant\`)+\`: \`+x.text).join(\`\\n\\n---\\n\\n\`).slice(0,20000):\`\`;
  let prompt=seed?\`Continuing this Codex Desktop thread. Prior context:\\n\\n\`+seed+\`\\n\\n---\\n\\nUser: \`+text:text;

  let msgId=(crypto.randomUUID&&crypto.randomUUID())||String(Date.now());
  let parentId=(crypto.randomUUID&&crypto.randomUUID())||String(Date.now()+1);
  let assistant=\`\`;
  let seenConv=null;

  try{
    await new Promise((resolve,reject)=>{
      let settled=!1;
      let timer=setTimeout(()=>{if(!settled){settled=!0;reject(new Error(\`ChatGPT stream timed out\`))}},9e4);
      let done=fn=>e=>{if(settled)return;settled=!0;clearTimeout(timer);fn(e)};
      try{
        client.startCompletionStream({
          request:{
            action:\`next\`,
            client_prepare_state:\`sent\`,
            messages:[{author:{role:\`user\`},content:{content_type:\`text\`,parts:[prompt]},id:msgId,metadata:{}}],
            model:model,
            parent_message_id:parentId,
            thinking_effort:effort,
            timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezone_offset_min:new Date().getTimezoneOffset()
          },
          onUpdate:u=>{try{
            if(!u)return;
            if(typeof u===\`string\`){assistant+=u;return}
            if(typeof u.text===\`string\`)assistant+=u.text;
            else if(typeof u.delta===\`string\`)assistant+=u.delta;
            else if(u.message&&typeof u.message.content===\`string\`)assistant+=u.message.content;
            else if(Array.isArray(u.parts))assistant+=u.parts.filter(x=>typeof x===\`string\`).join(\`\`);
          }catch{}},
          onEvent:ev=>{try{
            let d=ev&&ev.data;if(!d)return;
            if(typeof d===\`string\`){try{d=JSON.parse(d)}catch{return}}
            let cid=d.conversation_id||d.conversationId;if(cid)seenConv=cid;
            if(typeof d.o===\`string\`&&d.o)assistant+=d.o;
            if(typeof d.v===\`string\`&&d.v)assistant+=d.v;
            let parts=d.message&&d.message.content&&d.message.content.parts;
            if(Array.isArray(parts))for(let p of parts)if(typeof p===\`string\`&&p)assistant+=p;
          }catch{}},
          onComplete:done(()=>resolve()),
          onError:done(err=>reject(err&&err.error?err.error:err))
        });
      }catch(err){done(reject)(err)}
    });
  }catch(err){
    writeExtra({role:\`assistant\`,text:\`[Chat bridge] \`+String(err&&err.message||err).slice(0,2000)+\` — retrying via Codex transport.\`,source:\`chat-error\`});
    try{
      if(n&&typeof n===\`object\`){n.model=\`gpt-5.6-sol\`;if(n.effort==null)n.effort=\`medium\`}
    }catch{}
    return!1;
  }

  assistant=String(assistant||\`\`).trim()||\`(empty ChatGPT response)\`;
  writeExtra({role:\`assistant\`,text:assistant.slice(0,16000),source:\`chat\`});
  if(seenConv){try{
    let m=JSON.parse(localStorage.getItem(\`cdr-thread-map\`)||\`{}\`)||{};
    m.byLocal=m.byLocal&&typeof m.byLocal===\`object\`?m.byLocal:{};
    m.byChat=m.byChat&&typeof m.byChat===\`object\`?m.byChat:{};
    m.byLocal[key]=seenConv;m.byChat[seenConv]=key;
    localStorage.setItem(\`cdr-thread-map\`,JSON.stringify(m));
  }catch{}}
  return!0;
}catch(err){
  try{console.error(\`[cdr] Chat bridge crashed\`,err)}catch{}
  return!1;
}}`.replace(/\n\s*/g, "");

function patchChat(src) {
  let out = src;
  // Publish client on models() — this runs without needing a prior ChatGPT stream
  if (!out.includes(MARKER + ":publish-models")) {
    if (
      out.includes(
        "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}",
      )
    ) {
      out = replaceOnce(
        out,
        "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}",
        "async models(){try{globalThis.__cdrChatClient=this}catch{}/* " +
          MARKER +
          ":publish-models */return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}",
        "publish on models",
      );
    } else if (
      out.includes(
        "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v41:merge */",
      )
    ) {
      out = replaceOnce(
        out,
        "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v41:merge */",
        "async models(){try{globalThis.__cdrChatClient=this}catch{}/* " +
          MARKER +
          ":publish-models */return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v41:merge */",
        "publish on models v41",
      );
    } else {
      // Find models() wrapper
      const m = out.indexOf("async models(){return CDRMergeChatModels");
      assert(m >= 0, "models() merge wrapper missing");
      out =
        out.slice(0, m) +
        "async models(){try{globalThis.__cdrChatClient=this}catch{}/* " +
        MARKER +
        ":publish-models */return CDRMergeChatModels" +
        out.slice(m + "async models(){return CDRMergeChatModels".length);
    }
  }

  // Keep startCompletionStream publish too
  if (
    out.includes("sticky-chat-v43:publish-client") &&
    !out.includes(MARKER + ":publish-client")
  ) {
    out = out.replace(
      "sticky-chat-v43:publish-client",
      MARKER + ":publish-client",
    );
  }
  return out;
}

function patchSend(src) {
  let out = src;
  if (out.includes(MARKER + ":bridge-fn")) {
    console.log("send bridge already v44");
    return out;
  }

  // Replace entire CDRStickyChatSend function (v43)
  const old = extractFn(out, "async function CDRStickyChatSend(e,t,n){");
  out = out.slice(0, old.start) + NEW_BRIDGE + out.slice(old.end);

  // Ensure hook still present
  assert(out.includes("if(await CDRStickyChatSend(e,t,n))return"), "bridge hook missing");
  return out;
}

function verify(chat, send) {
  assert(chat.includes(MARKER + ":publish-models"), "models publish missing");
  assert(send.includes(MARKER + ":bridge-fn"), "bridge fn missing");
  assert(send.includes("falling back to AppServer"), "fallback missing");
  assert(send.includes("ChatGPT stream timed out"), "timeout missing");
  assert(send.includes("CDRExtractText"), "extract missing");
  // Must NOT block when client missing
  assert(
    !send.includes(
      "ChatGPT client not ready yet. Open the ChatGPT home composer once",
    ),
    "old blocking error still present",
  );
  parseOk("chat", chat);
  parseOk("send", send);
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-sticky-chat-v44.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v44-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
assert(fs.existsSync(CHAT), "CHAT missing");
assert(fs.existsSync(SEND), "SEND missing");

let chat = fs.readFileSync(CHAT, "utf8");
let send = fs.readFileSync(SEND, "utf8");

chat = patchChat(chat);
send = patchSend(send);

verify(chat, send);

fs.writeFileSync(CHAT, chat);
fs.writeFileSync(SEND, send);
console.log("wrote patches");

if (process.argv.includes("--check")) process.exit(0);

install();
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log(
  "\nSUCCESS — quit Codex fully, reopen.\n" +
    "Chat mode send: tries ChatGPT first; if client cold, falls back to AppServer so the message still goes.\n" +
    "After any ChatGPT /models fetch, subsequent Chat sends use Chat usage.",
);
