#!/usr/bin/env node
"use strict";
/**
 * v46: Fix "Cannot read properties of undefined (reading 'turn')"
 *
 * Root cause:
 * 1) cdr-thread-extras were merged as items with `{type:'userMessage', text}` but
 *    AppServer/Fa expects userMessage.content to be an ARRAY. That produces
 *    visibleTurnEntries where some rows lack `.turn`.
 * 2) gS(e,t) does `r.turn.turnStartedAtMs` with no null check → crash on send/re-render.
 * 3) Extras were also shoved into renderEntries (gap/timeline shaped) incorrectly.
 *
 * Fix:
 * - Correct userMessage item shape: content:[{type:'text',text,text_elements:[]}]
 * - Guard gS against missing turn
 * - Merge extras only into visibleTurnEntries; rebuild renderEntries from that list
 *   (keep non-turn gap rows from base renderEntries, append mapped turns)
 * - Clear streaming flags when Chat bridge handles the send
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v46";

const LOCAL = path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js");
const TURNS = path.join(
  ASSETS,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
);
const SEND = path.join(
  ASSETS,
  "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
);

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
  assert(n === 1, `${label}: expected 1, got ${n}`);
  return src.replace(from, to);
}
function parseOk(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (err) {
    const m = /\((\d+):(\d+)\)/.exec(err.message);
    let ctx = "";
    if (m) {
      const lines = String(src).split("\n");
      const line = lines[Number(m[1]) - 1] || String(src);
      const col = Number(m[2]);
      ctx = "\n  near: " + JSON.stringify(line.slice(Math.max(0, col - 80), col + 80));
    }
    throw new Error(`${label}: ${err.message}${ctx}`);
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

const MAP_TURN =
  "let mapped=extras.map((x,i)=>{" +
  "let isUser=x.role===`user`;" +
  "let item=isUser" +
  "?{id:`cdr-extra-item-`+i,type:`userMessage`,content:[{type:`text`,text:String(x.text||``),text_elements:[]}]}" +
  ":{id:`cdr-extra-item-`+i,type:`agentMessage`,text:String(x.text||``)};" +
  "let turn={id:`cdr-extra-`+i+`-`+(x.ts||i),status:`completed`,turnStartedAtMs:x.ts||Date.now(),items:[item],cdrSource:x.source||`chat`};" +
  "return{physicalTurnIds:[],preserveServerUserMessages:!1,requests:[],turn,turnId:turn.id,turnIndex:1e6+i,turnKey:turn.id,turnSearchKey:turn.id,estimatedHeightPx:96,cdrSource:x.source||`chat`}" +
  "});";

function extrasTickIife() {
  return (
    "(()=>{/* " +
    MARKER +
    ":extras-tick */void CDRExtrasTick;let base=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l});try{let key=`local:`+e;let extras=JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`);if(!Array.isArray(extras)||!extras.length)return base;" +
    MAP_TURN +
    "let B=[...(base.visibleTurnEntries||[]).filter(e=>!e||!e.cdrSource),...mapped];" +
    "let gaps=(base.renderEntries||[]).filter(e=>e&&(e.type===`gap`||e.turn==null&&e.turnKey!=null&&!e.cdrSource));" +
    "let z=[...gaps,...B];" +
    "return{...base,hasRenderableTurns:!0,hasUserMessage:base.hasUserMessage||extras.some(x=>x.role===`user`),visibleTurnEntries:B,renderEntries:z}}catch{return base}})()"
  );
}

function bootstrapExtrasTick(src) {
  let out = src;
  // Repair broken inject from earlier sticky attempts
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

  const bodyAnchor =
    "){let _=r(Ai),v=Pi(),y=Qc(),b=(0,Tw.useRef)(null),x=Kc(),S=i(sr,e),C=i(Qr,e);i(Zn,e),i(nr,null);";
  if (!out.includes("CDRExtrasTick") && out.includes(bodyAnchor)) {
    out = replaceOnce(
      out,
      bodyAnchor,
      "){let[CDRExtrasTick,CDRSetExtrasTick]=(0,Tw.useState)(0);(0,Tw.useEffect)(()=>{/* codex-rebuild:sticky-chat-v43:extras-listen */let h=()=>CDRSetExtrasTick(e=>e+1);window.addEventListener(`cdr-thread-extras-change`,h);return()=>window.removeEventListener(`cdr-thread-extras-change`,h)},[]);let _=r(Ai),v=Pi(),y=Qc(),b=(0,Tw.useRef)(null),x=Kc(),S=i(sr,e),C=i(Qr,e);i(Zn,e),i(nr,null);",
      "Cw extras listen hooks",
    );
  }

  const rhsOld =
    "{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l})";
  assert(out.includes(rhsOld), "visibleTurnEntries destructure missing — cannot bootstrap extras-tick");
  return replaceOnce(
    out,
    rhsOld,
    "{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=" +
      extrasTickIife(),
    "bootstrap extras-tick",
  );
}

function patchLocal(src) {
  let out = src;

  // Guard gS
  if (!out.includes(MARKER + ":gs-guard")) {
    out = replaceOnce(
      out,
      "function gS(e,t){for(let n=e.length-1;n>=0;--n){let r=e[n];if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}",
      "function gS(e,t){/* " +
        MARKER +
        ":gs-guard */for(let n=e.length-1;n>=0;--n){let r=e[n];if(!r||!r.turn)continue;if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}",
      "gS guard",
    );
  }

  // Idempotent: already on v46 with correct userMessage.content[] shape
  if (
    out.includes(MARKER + ":extras-tick") &&
    out.includes("content:[{type:`text`") &&
    !out.includes("type:x.role===`user`?`userMessage`:`agentMessage`,text:x.text")
  ) {
    console.log("local already v46");
    return out;
  }

  // Prefer v43 marker (first apply); also accept an older v46 body to rewrite
  let tickStart = out.indexOf("/* codex-rebuild:sticky-chat-v43:extras-tick */");
  if (tickStart < 0) tickStart = out.indexOf("/* " + MARKER + ":extras-tick */");
  if (tickStart < 0) {
    console.log("extras-tick missing — bootstrapping from stock RHS");
    return bootstrapExtrasTick(out);
  }

  const iifeStart = out.lastIndexOf("(()=>{", tickStart);
  const after = out.indexOf("})(),V=B.at(-1)", tickStart);
  assert(iifeStart > 0 && after > tickStart, "extras IIFE bounds missing");

  out = out.slice(0, iifeStart) + extrasTickIife() + out.slice(after + "})()".length);
  return out;
}

function patchTurns(src) {
  let out = src;
  if (out.includes(MARKER + ":turns-merge")) {
    console.log("turns already v46");
    return out;
  }
  const start = out.indexOf("/* codex-rebuild:sticky-chat-v43:turns-merge */");
  assert(start >= 0, "turns-merge v43 missing");
  const mapStart = out.indexOf("let mapped=extras.map(", start);
  const mapEnd = out.indexOf(");return base.concat(mapped)", mapStart);
  assert(mapStart > start && mapEnd > mapStart, "mapped block missing");

  // mapEnd points at the closing `)` of extras.map(...). newMap already includes
  // that `)`, so resume at mapEnd+1 (the `;return...`).
  const newMap =
    "let mapped=extras.map((x,i)=>{" +
    "let isUser=x.role===`user`;" +
    "let item=isUser" +
    "?{id:`cdr-extra-item-`+i,type:`userMessage`,content:[{type:`text`,text:String(x.text||``),text_elements:[]}]}" +
    ":{id:`cdr-extra-item-`+i,type:`agentMessage`,text:String(x.text||``)};" +
    "return{id:`cdr-extra-`+i+`-`+(x.ts||i),status:`completed`,turnStartedAtMs:x.ts||Date.now(),items:[item],cdrSource:x.source||`chat`}" +
    "})/* " +
    MARKER +
    ":turns-merge */";

  out = out.slice(0, mapStart) + newMap + out.slice(mapEnd + 1);
  return out;
}

function patchSend(src) {
  let out = src;
  if (out.includes(MARKER + ":stream-clear")) {
    console.log("send already v46");
    return out;
  }
  const clearBody =
    "if(await CDRStickyChatSend(e,t,n)){try{e.streamState&&(e.streamState.streamingConversations&&e.streamState.streamingConversations.delete(t),typeof e.streamState.clearConversationStreaming===`function`&&e.streamState.clearConversationStreaming(t),typeof e.notifyConversationUpdated===`function`&&e.notifyConversationUpdated(t),typeof e.broadcastConversationSnapshot===`function`&&e.broadcastConversationSnapshot(t))}catch{}return}/* " +
    MARKER +
    ":stream-clear */";

  // Prefer exact v43 hook comment; else bare return after bridge
  if (
    out.includes(
      "if(await CDRStickyChatSend(e,t,n))return;/* codex-rebuild:sticky-chat-v43:bridge-hook */",
    )
  ) {
    return replaceOnce(
      out,
      "if(await CDRStickyChatSend(e,t,n))return;/* codex-rebuild:sticky-chat-v43:bridge-hook */",
      clearBody,
      "clear streaming after chat bridge",
    );
  }
  return replaceOnce(
    out,
    "if(await CDRStickyChatSend(e,t,n))return;",
    clearBody,
    "clear streaming after chat bridge (bare)",
  );
}

function verify(local, turns, send) {
  assert(local.includes(MARKER + ":gs-guard"), "gs-guard missing");
  assert(local.includes(MARKER + ":extras-tick"), "extras-tick missing");
  assert(local.includes("content:[{type:`text`"), "userMessage content shape missing");
  assert(turns.includes(MARKER + ":turns-merge"), "turns-merge missing");
  assert(turns.includes("content:[{type:`text`"), "turns userMessage shape missing");
  assert(send.includes(MARKER + ":stream-clear"), "stream-clear missing");
  assert(!local.includes("type:x.role===`user`?`userMessage`:`agentMessage`,text:x.text"), "old bad item shape still in local");
  parseOk("local", local);
  parseOk("turns", turns);
  parseOk("send", send);
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-sticky-chat-v46.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of LIVE) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v46-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
let local = fs.readFileSync(LOCAL, "utf8");
let turns = fs.readFileSync(TURNS, "utf8");
let send = fs.readFileSync(SEND, "utf8");

local = patchLocal(local);
turns = patchTurns(turns);
send = patchSend(send);

verify(local, turns, send);

fs.writeFileSync(LOCAL, local);
fs.writeFileSync(TURNS, turns);
fs.writeFileSync(SEND, send);
console.log("wrote patches");

if (process.argv.includes("--check")) process.exit(0);

install();
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});
console.log(
  "\nSUCCESS — quit Codex, reopen.\n" +
    "Fixed: Chat extras now use real userMessage.content[] shape; gS null-safe; streaming cleared after Chat send.",
);


