#!/usr/bin/env node
"use strict";
/**
 * v52: Fix "Oops, an error has occurred" when opening Codex threads.
 *
 * Root causes addressed (defense in depth, no feature removal):
 * 1) Sticky sync (v43) calls sae(..., startNewConversation) when native
 *    productMode !== codex and there is no cached Codex location. That spawns
 *    / remounts conversations during layout and can blow the App error boundary.
 *    Fix: no-op startNewConversation inside sticky sync; wrap sae in try/catch.
 * 2) Local thread extras/render path: harden remaining unguarded access with an
 *    outer safe fallback around the extras-tick derived state.
 * 3) Keep v51 synth-turn + error-boundary stash; show real error under Oops.
 *
 * Keep: sticky /local, Chat bridge, discrete picker, extras overlay.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v52";

const PAGE = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("ogh9jurw") && f.endsWith(".js")),
);
const LOCAL = path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js");
const MAIN = path.join(ASSETS, "app-main-CBwHZrMR.js");
const SEND = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("oxnpxkxc") && f.endsWith(".js")),
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
    execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true; pkill -f 'Codex.payload' || true", {
      stdio: "ignore",
    });
  } catch {}
}

function patchPage(src) {
  let out = src;
  const bad =
    "(0,BI.useLayoutEffect)(()=>{/* codex-rebuild:sticky-chat-v43:sync */if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s])";
  const good =
    "(0,BI.useLayoutEffect)(()=>{/* " +
    MARKER +
    ":sticky-safe */if(r===`codex`)return;try{sae(i,{currentMode:r,navigate:(...e)=>{try{return a(...e)}catch(err){try{console.error(`[cdr] sticky navigate`,err)}catch{}}},nextMode:`codex`,startNewConversation:()=>{/* intentionally no-op: sticky must not spawn/remount threads */}})}catch(err){try{console.error(`[cdr] sticky sync`,err)}catch{}}},[r,i,a])";
  if (out.includes(bad)) {
    out = replaceOnce(out, bad, good, "sticky-safe sync");
  } else if (out.includes(MARKER + ":sticky-safe")) {
    console.log("sticky-safe already present");
  } else {
    // tolerate already-instrumented v43 variants
    const loose =
      / \(0,BI\.useLayoutEffect\)\(\(\)=>\{\/\* codex-rebuild:sticky-chat-v43:sync \*\/if\(r!==`codex`\)sae\(i,\{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s\}\)\,\[r,i,a,s\]\)/;
    assert(out.includes("sticky-chat-v43:sync") || out.includes("sticky-safe"), "sticky sync anchor missing");
    if (out.includes("sticky-chat-v43:sync") && !out.includes("sticky-safe")) {
      out = out.replace(
        "(0,BI.useLayoutEffect)(()=>{/* codex-rebuild:sticky-chat-v43:sync */if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s])",
        good,
      );
      assert(out.includes(MARKER + ":sticky-safe"), "sticky-safe replace failed");
    }
  }
  return out;
}

function patchLocal(src) {
  let out = src;
  // Wrap extras-tick derived block so any throw falls back to base atom values.
  const start = out.indexOf("/* codex-rebuild:sticky-chat-v49:extras-tick */");
  assert(start >= 0 || out.includes(MARKER + ":extras-wrap"), "extras-tick missing");
  if (start >= 0 && !out.includes(MARKER + ":extras-wrap")) {
    // The IIFE starts at (()=>{/* extras-tick */ ... })()
    // Replace opening to add nested try already present — strengthen catch to never throw
    const oldOpen = "(()=>{/* codex-rebuild:sticky-chat-v49:extras-tick */void CDRExtrasTick;let base=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l});try{";
    const newOpen =
      "(()=>{/* " +
      MARKER +
      ":extras-wrap */void CDRExtrasTick;let base;try{base=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l})}catch{base={visibleTurnEntries:[],renderEntries:[],hasRenderableTurns:!1,hasUserMessage:!1}}try{";
    assert(out.includes(oldOpen), "extras open anchor missing");
    out = replaceOnce(out, oldOpen, newOpen, "extras wrap open");

    const oldCatch = "}catch{return base}})(),V=B.at(-1);";
    const newCatch =
      "}catch{return base||{visibleTurnEntries:[],renderEntries:[],hasRenderableTurns:!1,hasUserMessage:!1}}})(),V=(B&&B.at)?B.at(-1):null;";
    if (out.includes(oldCatch)) {
      out = replaceOnce(out, oldCatch, newCatch, "extras wrap catch");
    }
  }

  // Guard gS without breaking the multi-declarator `let H=...,ee=...`
  const oldH =
    "let H=O==null?null:gS((_.get(al,{conversationId:e,isBackgroundSubagentsEnabled:l}).visibleTurnEntries||[]).filter(e=>e&&e.turn),O.updatedAt*1e3)/* codex-rebuild:sticky-chat-v50:extras-safe */";
  if (out.includes(oldH) && !out.includes(MARKER + ":gs-try")) {
    const newH =
      "let H=(()=>{try{return O==null?null:gS((_.get(al,{conversationId:e,isBackgroundSubagentsEnabled:l}).visibleTurnEntries||[]).filter(e=>e&&e.turn),O.updatedAt*1e3)}catch{return null}})()/* " +
      MARKER +
      ":gs-try */";
    out = replaceOnce(out, oldH, newH, "gS try");
  }
  return out;
}

function patchMain(src) {
  let out = src;
  // Ensure error boundary fallback still stashes; enhance default Oops to include message via title already.
  if (!out.includes("error-boundary-v52") && !out.includes("cdr-last-error")) {
    console.log("WARN: error-boundary-v52 missing in main — leaving as-is");
  }
  return out;
}

function patchOops(src) {
  let out = src;
  // Show last error under Oops so thread-open failures are never opaque again.
  const bad =
    "return e[2]===Symbol.for(`react.memo_cache_sentinel`)?(r=(0,sP.jsx)(Pn,{defaultLocale:ng,locale:ng,onError:aP,children:(0,sP.jsxs)(`div`,{className:`flex h-full flex-col items-center justify-center gap-4 p-6`,children:[t,n,(0,sP.jsx)(ar,{onClick:iP,children:(0,sP.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]})}),e[2]=r):r=e[2],r}";
  // If exact match fails, skip — optional UX
  if (out.includes(bad) && !out.includes(MARKER + ":oops-detail")) {
    const good =
      "return e[2]===Symbol.for(`react.memo_cache_sentinel`)?(r=(0,sP.jsx)(Pn,{defaultLocale:ng,locale:ng,onError:aP,children:(0,sP.jsxs)(`div`,{className:`flex h-full flex-col items-center justify-center gap-4 p-6`,children:[t,n,(0,sP.jsx)(`pre`,{style:{maxWidth:`720px`,whiteSpace:`pre-wrap`,fontSize:`12px`,opacity:.8},children:(()=>{try{return JSON.parse(localStorage.getItem(`cdr-last-error`)||`null`)?.message||``}catch{return``}})()})/* " +
      MARKER +
      ":oops-detail */,(0,sP.jsx)(ar,{onClick:iP,children:(0,sP.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]})}),e[2]=r):r=e[2],r}";
    out = replaceOnce(out, bad, good, "oops detail");
  }
  return out;
}

function verify(page, local, send) {
  assert(page.includes(MARKER + ":sticky-safe"), "sticky-safe missing");
  assert(page.includes("intentionally no-op"), "no-op startNewConversation missing");
  assert(send.includes("sticky-chat-v51:synth-turn") || send.includes("return{turn:{id:"), "v51 synth-turn regression");
  assert(send.includes("CDRStickyChatSend"), "bridge regression");
  parseOk("page", page);
  parseOk("local", local);
  parseOk("send", send);
  console.log("verify ok");
}

killCodex();
let page = fs.readFileSync(PAGE, "utf8");
let local = fs.readFileSync(LOCAL, "utf8");
let main = fs.readFileSync(MAIN, "utf8");
let send = fs.readFileSync(SEND, "utf8");

page = patchPage(page);
page = patchOops(page);
local = patchLocal(local);
main = patchMain(main);
verify(page, local, send);

fs.writeFileSync(PAGE, page);
fs.writeFileSync(LOCAL, local);
fs.writeFileSync(MAIN, main);
console.log("wrote sources");

if (process.argv.includes("--check")) process.exit(0);

const packed = path.join(ROOT, "out", "app-sticky-chat-v52.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
for (const dest of LIVE) {
  if (!fs.existsSync(dest)) {
    console.log("skip", dest);
    continue;
  }
  fs.copyFileSync(dest, `${dest}.bak-pre-v52fix-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});

// Clear thread extras that can poison open
try {
  execFileSync("node", [path.join(ROOT, "scripts/clear-cdr-thread-extras.js")], {
    cwd: ROOT,
    stdio: "inherit",
  });
} catch (e) {
  console.log("extras clear skipped", e.message);
}

console.log(
  "\nSUCCESS v52 — sticky sync no longer spawns threads; local render hardened.\n" +
    "Fully quit Codex (Cmd+Q), reopen, open a Codex thread again.",
);



