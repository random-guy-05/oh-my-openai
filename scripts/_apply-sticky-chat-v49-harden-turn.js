#!/usr/bin/env node
"use strict";
/**
 * v49 FINAL: Fix reading 'turn' without removing sticky Chat features.
 *
 * Remaining crash after v48 (confirmed in LIVE asar):
 *   CC({visibleTurnEntries:r}){ … r.flatMap(({turn:i})=>…) }
 *   D.map(e=>e.turn)
 * Destructuring/reading .turn on an undefined array element throws exactly:
 *   Cannot read properties of undefined (reading 'turn')
 * which Bo→Ho→Fo surfaces as "Error creating chat".
 *
 * Also: turns-merge still injects synthetic turns into Fa/conversationTurns.
 * That can poison native pipelines. Chat extras stay visible via extras-tick UI
 * merge (user-facing feature preserved). Bridge + sticky + picker unchanged.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v49";

const LOCAL = path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js");
const TURNS = path.join(
  ASSETS,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
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
      if (/cursor-agent|grep|sticky-chat|_apply-|release-live/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

function patchTurns(src) {
  let out = src;

  if (out.includes(MARKER + ":turns-fa-safe")) {
    console.log("turns already fa-safe");
  } else {
    // Stop feeding synthetic turns into Fa — keep the IIFE so sticky hooks remain,
    // but always return native turns only. Transcript Chat extras come from extras-tick.
    const extrasKey = out.indexOf("cdr-thread-extras:`+key");
    assert(extrasKey >= 0, "turns extras merge block missing");
    const iifeStart = out.lastIndexOf("(()=>{", extrasKey);
    const iifeEnd = out.indexOf("})(),hasConversation:", extrasKey);
    assert(iifeStart > 0 && iifeEnd > iifeStart, "turns IIFE bounds missing");

    const neu =
      "(()=>{/* " +
      MARKER +
      ":turns-fa-safe */let base=d||[];try{let key=`local:`+e;JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`)}catch{}return base})()";
    out = out.slice(0, iifeStart) + neu + out.slice(iifeEnd + "})()".length);
  }

  // Finish berry seatbelt if second map still bare
  if (
    out.includes("a=n.map(({turn:e})=>e)") &&
    !out.includes("a=n.filter(e=>e&&e.turn).map(({turn:e})=>e)")
  ) {
    out = replaceOnce(
      out,
      "a=n.map(({turn:e})=>e)",
      "a=n.filter(e=>e&&e.turn).map(({turn:e})=>e)/* " + MARKER + ":harden-za2 */",
      "harden za2",
    );
  }

  return out;
}

function extrasTickIife() {
  // Always merge from localStorage into UI lists (Fa no longer has extras).
  // Never strip native render rows.
  return (
    "(()=>{/* " +
    MARKER +
    ":extras-tick */void CDRExtrasTick;" +
    "let base=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l});" +
    "try{" +
    "let key=`local:`+e;" +
    "let extras=JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`);" +
    "if(!Array.isArray(extras)||!extras.length)return base;" +
    "let mapped=extras.map((x,i)=>{" +
    "if(!x||typeof x!==`object`)return null;" +
    "let text=String(x.text||``);" +
    "let isUser=x.role===`user`;" +
    "let item=isUser" +
    "?{id:`cdr-extra-item-`+i,type:`userMessage`,content:[{type:`text`,text,text_elements:[]}]}" +
    ":{id:`cdr-extra-item-`+i,type:`agentMessage`,text};" +
    "let id=`cdr-extra-`+i+`-`+(x.ts||i);" +
    "let turn={id,turnId:id,status:`completed`,turnStartedAtMs:Number(x.ts)||Date.now(),items:[item],cdrSource:x.source||`chat`};" +
    "return{physicalTurnIds:[id],preserveServerUserMessages:!1,requests:[],turn,turnId:id,turnIndex:1e6+i,turnKey:id,turnSearchKey:id,estimatedHeightPx:96,cdrSource:x.source||`chat`}" +
    "}).filter(e=>e&&e.turn&&Array.isArray(e.turn.items));" +
    "if(!mapped.length)return base;" +
    "let baseVis=(base.visibleTurnEntries||[]).filter(e=>e&&e.turn&&!e.cdrSource);" +
    "let B=[...baseVis,...mapped];" +
    "let z=[...(base.renderEntries||[]).filter(e=>e&&!e.cdrSource),...mapped];" +
    "return{...base,hasRenderableTurns:!0,hasUserMessage:base.hasUserMessage||extras.some(x=>x&&x.role===`user`),visibleTurnEntries:B,renderEntries:z}" +
    "}catch{return base}" +
    "})()"
  );
}

function patchLocal(src) {
  let out = src;

  // Replace extras-tick body
  let tickStart = -1;
  for (const m of [
    "/* codex-rebuild:sticky-chat-v49:extras-tick */",
    "/* codex-rebuild:sticky-chat-v48:extras-tick */",
    "/* codex-rebuild:sticky-chat-v47:extras-tick */",
    "/* codex-rebuild:sticky-chat-v46:extras-tick */",
    "/* codex-rebuild:sticky-chat-v43:extras-tick */",
  ]) {
    tickStart = out.indexOf(m);
    if (tickStart >= 0) break;
  }
  assert(tickStart >= 0, "extras-tick missing");
  const iifeStart = out.lastIndexOf("(()=>{", tickStart);
  const after = out.indexOf("})(),V=B.at(-1)", tickStart);
  assert(iifeStart > 0 && after > tickStart, "extras IIFE bounds");
  out = out.slice(0, iifeStart) + extrasTickIife() + out.slice(after + "})()".length);

  // THE crash site: CC flatMap
  const ccOld =
    "function CC({isBackgroundSubagentsEnabled:e,previousEntries:t,projectlessOutputDirectory:n,visibleTurnEntries:r}){let i=t[0]?.generatedImages,a=r.flatMap(({preserveServerUserMessages:t,requests:r,turn:i})=>{if(!i.items.some(e=>e.type===`imageGeneration`&&e.src!=null))return[];";
  const ccNew =
    "function CC({isBackgroundSubagentsEnabled:e,previousEntries:t,projectlessOutputDirectory:n,visibleTurnEntries:r}){/* " +
    MARKER +
    ":harden-CC */let i=t[0]?.generatedImages,a=(Array.isArray(r)?r:[]).filter(e=>e&&e.turn&&Array.isArray(e.turn.items)).flatMap(({preserveServerUserMessages:t,requests:r,turn:i})=>{if(!i.items.some(e=>e.type===`imageGeneration`&&e.src!=null))return[];";
  if (out.includes(ccOld)) {
    out = replaceOnce(out, ccOld, ccNew, "harden CC");
  } else {
    assert(out.includes(MARKER + ":harden-CC"), "CC harden missing");
  }

  // D.map(e=>e.turn) — exact crash pattern
  const dOld = "D.map(e=>e.turn),E):Ow";
  if (out.includes(dOld)) {
    out = replaceOnce(
      out,
      dOld,
      "D.filter(e=>e&&e.turn).map(e=>e.turn)/* " + MARKER + ":harden-D-map */,E):Ow",
      "harden D.map",
    );
  } else {
    assert(out.includes(MARKER + ":harden-D-map"), "D.map harden missing");
  }

  // generated-images cache flatMap: NC.get(e.turn) throws if e undefined
  const ncOld =
    "visibleTurnEntries:a}){return e?a.flatMap(e=>{let a=NC.get(e.turn);";
  if (out.includes(ncOld)) {
    out = replaceOnce(
      out,
      ncOld,
      "visibleTurnEntries:a}){return e?(Array.isArray(a)?a:[]).filter(e=>e&&e.turn).flatMap(e=>{let a=NC.get(e.turn);/* " +
        MARKER +
        ":harden-NC */",
      "harden NC.get(e.turn)",
    );
  } else {
    assert(out.includes(MARKER + ":harden-NC"), "NC harden missing");
  }

  // gS guard if missing
  if (!out.includes(":gs-guard")) {
    out = replaceOnce(
      out,
      "function gS(e,t){for(let n=e.length-1;n>=0;--n){let r=e[n];if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}",
      "function gS(e,t){/* " +
        MARKER +
        ":gs-guard */for(let n=e.length-1;n>=0;--n){let r=e[n];if(!r||!r.turn)continue;if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}",
      "gS",
    );
  }

  return out;
}

function verify(local, turns) {
  assert(local.includes(MARKER + ":extras-tick"), "extras-tick");
  assert(local.includes(MARKER + ":harden-CC"), "CC harden");
  assert(local.includes(MARKER + ":harden-D-map"), "D.map harden");
  assert(local.includes(MARKER + ":harden-NC"), "NC harden");
  assert(turns.includes(MARKER + ":turns-fa-safe"), "turns fa-safe");
  assert(local.includes("cdr-thread-extras"), "extras feature present");
  assert(local.includes("CDRExtrasTick"), "extras tick hook present");
  assert(
    !local.includes(
      "a=r.flatMap(({preserveServerUserMessages:t,requests:r,turn:i})=>{if(!i.items.some",
    ),
    "raw unsafe CC remains",
  );
  assert(
    !local.includes("return e?a.flatMap(e=>{let a=NC.get(e.turn);"),
    "raw unsafe NC remains",
  );
  parseOk("local", local);
  parseOk("turns", turns);
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-sticky-chat-v49.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
  for (const dest of LIVE) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v49-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
let local = fs.readFileSync(LOCAL, "utf8");
let turns = fs.readFileSync(TURNS, "utf8");
local = patchLocal(local);
turns = patchTurns(turns);
verify(local, turns);
fs.writeFileSync(LOCAL, local);
fs.writeFileSync(TURNS, turns);
console.log("wrote");

if (process.argv.includes("--check")) process.exit(0);

install();
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});
console.log(
  "\nSUCCESS — fully quit Codex, reopen.\n" +
    "Hardened CC/D.map crash sites; Chat extras stay via UI merge; Fa no longer poisoned.",
);




