#!/usr/bin/env node
"use strict";
/**
 * v53: Fix Chat-send Oops ("Update ChatGPT" ErrorBoundary) after sticky Chat bridge.
 *
 * Root cause: cdr-thread-extras were mapped into transcript turns WITHOUT `params`.
 * Native render reads `ee.params.clientUserMessageId` / `i.params.cwd` bare →
 * TypeError → nested ErrorBoundary bg (Oops + Update ChatGPT).
 *
 * Keep: sticky /local, ChatGPT bridge, discrete picker, extras overlay.
 *
 * Fix:
 * 1) Synthesize full turn.params (+ agent phase) on extras map
 * 2) Avoid mixing gap-shaped renderEntries with turn-shaped extras
 * 3) Seatbelt bare .params reads
 * 4) Show cdr-last-error under nested Oops
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v53";

const LOCAL = path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js");
const JJ = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("jj50pjos") && f.endsWith(".js")),
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
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
}
function killCodex() {
  try {
    execSync(
      "pkill -f 'CodexDesktop-Rebuild/Codex.app' || true; pkill -f 'Codex.payload' || true",
      { stdio: "ignore" },
    );
  } catch {}
}

function extrasTickIife() {
  // visibleTurnEntries: Fa-compatible turn entries
  // renderEntries: ONLY merge when base has no timeline gaps (Pa identity case),
  // otherwise keep native renderEntries and rely on visibleTurnEntries + a
  // dedicated renderable clone that matches what SC expects from Fa output
  // (same object shape as Fa's x.push entries — SC accepts those when timeline is null).
  return (
    "(()=>{/* " +
    MARKER +
    ":extras-safe */void CDRExtrasTick;" +
    "let base;try{base=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l})}catch{base={visibleTurnEntries:[],renderEntries:[],hasRenderableTurns:!1,hasUserMessage:!1}}" +
    "try{" +
    "let key=`local:`+e;" +
    "let extras=JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`);" +
    "if(!Array.isArray(extras)||!extras.length)return base;" +
    "let mapped=extras.map((x,i)=>{" +
    "if(!x||typeof x!==`object`)return null;" +
    "let text=String(x.text||``);" +
    "let isUser=x.role===`user`;" +
    "let item=isUser" +
    "?{id:`cdr-extra-item-`+i,type:`userMessage`,content:[{type:`text`,text,text_elements:[]}],attachments:[]}" +
    ":{id:`cdr-extra-item-`+i,type:`agentMessage`,text,phase:null,memoryCitation:null};" +
    "let id=`cdr-extra-`+i+`-`+(x.ts||i);" +
    // params REQUIRED — JS/Ef render reads ee.params.clientUserMessageId / i.params.cwd bare.
    "let turn={id,turnId:id,status:`completed`,turnStartedAtMs:Number(x.ts)||Date.now(),items:[item],params:{model:null,cwd:null,threadId:e,input:isUser?[{type:`text`,text,text_elements:[]}]:[],attachments:[],clientUserMessageId:null},cdrSource:x.source||`chat`};" +
    // Match Fa x.push shape (no estimatedHeightPx — reserved for virtualized gap rows)
    "return{physicalTurnIds:[id],preserveServerUserMessages:!1,requests:[],turn,turnId:id,turnIndex:1e6+i,turnKey:id,turnSearchKey:id,cdrSource:x.source||`chat`}" +
    "}).filter(e=>e&&e.turn&&Array.isArray(e.turn.items));" +
    "if(!mapped.length)return base;" +
    "let baseVis=(base.visibleTurnEntries||[]).filter(e=>e&&e.turn&&!e.cdrSource);" +
    "let B=[...baseVis,...mapped];" +
    // Only append extras to renderEntries if native list is turn-shaped (no gap placeholders).
    // Gap entries have type:`gap` / estimatedHeightPx without turn — mixing shapes crashes SC→JS.
    "let baseRen=(base.renderEntries||[]).filter(e=>e&&!e.cdrSource);" +
    "let renIsTurnShaped=!baseRen.some(e=>e&&(e.type===`gap`||(e.estimatedHeightPx!=null&&e.turn==null)));" +
    "let z=renIsTurnShaped?[...baseRen,...mapped]:baseRen;" +
    "return{...base,hasRenderableTurns:!0,hasUserMessage:base.hasUserMessage||extras.some(x=>x&&x.role===`user`),visibleTurnEntries:B,renderEntries:z}" +
    "}catch{return base||{visibleTurnEntries:[],renderEntries:[],hasRenderableTurns:!1,hasUserMessage:!1}}" +
    "})()"
  );
}

function patchLocal(src) {
  let out = src;
  let tickStart = -1;
  for (const m of [
    "/* codex-rebuild:sticky-chat-v53:extras-safe */",
    "/* codex-rebuild:sticky-chat-v52:extras-wrap */",
    "/* codex-rebuild:sticky-chat-v49:extras-tick */",
  ]) {
    tickStart = out.indexOf(m);
    if (tickStart >= 0) break;
  }
  assert(tickStart >= 0, "extras IIFE marker missing");
  if (!(out.includes(MARKER + ":extras-safe") && !process.argv.includes("--force"))) {
    const iifeStart = out.lastIndexOf("(()=>{", tickStart);
    const after = out.indexOf("})(),V=", tickStart);
    assert(iifeStart > 0 && after > tickStart, "extras IIFE bounds");
    out = out.slice(0, iifeStart) + extrasTickIife() + out.slice(after + "})()".length);
  } else {
    console.log("extras-safe already present");
  }

  // Seatbelts: bare turn.params reads crash Chat extras (and any incomplete turns).
  if (!out.includes(MARKER + ":params-cwd")) {
    out = replaceOnce(
      out,
      "workspaceRoot:i.params.cwd??null",
      "workspaceRoot:i.params?.cwd??null/* " + MARKER + ":params-cwd */",
      "params.cwd seatbelt",
    );
  }
  if (!out.includes(MARKER + ":params-eq")) {
    const badEq =
      "e.turnId===t.turnId&&e.status===t.status&&e.params.threadId===t.params.threadId&&(0,Xb.default)(e.params.input,t.params.input)&&(0,Xb.default)(e.params.attachments,t.params.attachments)&&(0,Xb.default)(Yb(e),Yb(t))";
    const goodEq =
      "e.turnId===t.turnId&&e.status===t.status&&e.params?.threadId===t.params?.threadId&&(0,Xb.default)(e.params?.input,t.params?.input)&&(0,Xb.default)(e.params?.attachments,t.params?.attachments)&&(0,Xb.default)(Yb(e),Yb(t))/* " +
      MARKER +
      ":params-eq */";
    if (out.includes(badEq)) {
      out = replaceOnce(out, badEq, goodEq, "params equality seatbelt");
    }
  }
  if (!out.includes(MARKER + ":params-client")) {
    const bad =
      "t[12]===ee.params.clientUserMessageId?se=t[13]:(se=()=>{let e=ee.params.clientUserMessageId";
    if (out.includes(bad)) {
      out = replaceOnce(
        out,
        bad,
        "t[12]===ee.params?.clientUserMessageId?se=t[13]:(se=()=>{let e=ee.params?.clientUserMessageId/* " +
          MARKER +
          ":params-client */",
        "params.clientUserMessageId seatbelt",
      );
    }
  }
  return out;
}

function patchBg(src) {
  let out = src;
  if (out.includes(MARKER + ":oops-msg")) {
    console.log("oops-msg already present");
    return out;
  }
  // Inject error message into bg fallback children, after the title `a`
  const bad =
    "children:[i,a,(0,Cg.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,Cg.jsx)(ie,{onClick:s,children:c})]})]";
  assert(out.includes(bad), "bg children anchor missing");
  const good =
    "children:[i,a,(0,Cg.jsx)(`pre`,{style:{maxWidth:`640px`,whiteSpace:`pre-wrap`,fontSize:`12px`,opacity:.85,textAlign:`center`},children:(()=>{try{let e=JSON.parse(localStorage.getItem(`cdr-last-error`)||`null`);return e&&e.message?String(e.message).slice(0,500):``}catch{return``}})()})/* " +
    MARKER +
    ":oops-msg */,(0,Cg.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,Cg.jsx)(ie,{onClick:s,children:c})]})]";
  out = replaceOnce(out, bad, good, "bg oops msg");
  return out;
}

function verify(local, jj) {
  assert(local.includes(MARKER + ":extras-safe"), "extras-safe missing");
  assert(local.includes("renIsTurnShaped"), "renIsTurnShaped missing");
  assert(local.includes("phase:null"), "agent phase missing");
  assert(local.includes("clientUserMessageId:null"), "turn.params.clientUserMessageId missing");
  assert(local.includes(MARKER + ":params-cwd"), "params-cwd seatbelt missing");
  assert(jj.includes(MARKER + ":oops-msg"), "oops-msg missing");
  parseOk("local", local);
  parseOk("jj", jj);
  console.log("verify ok");
}

killCodex();
let local = fs.readFileSync(LOCAL, "utf8");
let jj = fs.readFileSync(JJ, "utf8");
local = patchLocal(local);
jj = patchBg(jj);
verify(local, jj);
fs.writeFileSync(LOCAL, local);
fs.writeFileSync(JJ, jj);
console.log("wrote sources");

if (process.argv.includes("--check")) process.exit(0);

const packed = path.join(ROOT, "out", "app-sticky-chat-v53.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
for (const dest of LIVE) {
  if (!fs.existsSync(dest)) {
    console.log("skip", dest);
    continue;
  }
  fs.copyFileSync(dest, `${dest}.bak-pre-v53-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log(
  "\nSUCCESS v53 — Chat extras no longer poison gap-shaped renderEntries; Oops shows real error.\n" +
    "Fully quit Codex (Cmd+Q), reopen, Chat mode, send on the hi thread again.",
);




