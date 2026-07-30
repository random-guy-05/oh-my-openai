#!/usr/bin/env node
"use strict";

// bugfix-v1 — Fix four issues reported after the custom-providers + fake-stream release:
//
// 1. "Oops an error has occurred" — Custom Providers panel crashes because
//    a.createElement doesn't exist (React module only exports jsx/jsxs).
//    Fix: replace a.createElement with the JSX runtime (U||a()).jsx, with
//    children merged into props.
//
// 2. Stop button doesn't revert to Send after chat response — the stream
//    state clearing in the send hook doesn't trigger a React re-render.
//    Fix: add explicit stream state clearing + extras-change event dispatch
//    inside the bridge, right after the animation completes.
//
// 3. Chat mode shows the prompting transcript — the codex→chat handoff
//    injects the entire codex transcript on every send (watermark resets
//    after reload). User sees the transcript being "prompted."
//    Fix: gate the codex→chat injection on !continuing (first message only).
//
// 4. Can't resume in Codex mode after Chat mode — the extras overlay merges
//    synthetic chat turn entries into the codex thread view, corrupting the
//    thread state and breaking resume.
//    Fix: gate the extras overlay merge on chat mode. In chat mode, show
//    only chat rows. In codex mode, keep only native codex turns.

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:bugfix-v1";

function asset(pred, label) {
  const name = fs.readdirSync(ASSETS).find(pred);
  if (!name) throw new Error(`missing ${label} bundle`);
  return path.join(ASSETS, name);
}

function replaceOne(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 target, found ${count}`);
  return source.replace(oldValue, newValue);
}

function parseOk(label, source) {
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error(`${label} parse failed: ${e.message}`);
  }
}

// ─── Fix 1: Custom Providers panel — createElement → jsx ───────────
function fixPanel(sectionsSrc) {
  if (sectionsSrc.includes(MARKER + ":panel")) return sectionsSrc;

  const old = "let el=(tag,props,...kids)=>(0,a.createElement)(tag,props,...kids);";
  // Use the JSX runtime (U is pre-computed as a() at module scope).
  // jsx(type, props) with children inside props — not createElement(tag, props, ...kids).
  const replacement = "let el=(tag,props,...kids)=>{let p={...props};if(kids.length===1)p.children=kids[0];else if(kids.length>1)p.children=kids;let _R;try{_R=U||a()}catch{_R=a}return(0,_R.jsx||_R.createElement||a.createElement)(tag,p)};";

  if (!sectionsSrc.includes(old)) {
    // Already fixed or different — check if jsx runtime is used
    if (sectionsSrc.includes("(0,U.jsx)") || sectionsSrc.includes("_R.jsx") || sectionsSrc.includes("_R.createElement")) {
      console.log("[skip] panel el helper already fixed");
      return sectionsSrc + `\n/* ${MARKER}:panel */\n`;
    }
    throw new Error("panel el helper anchor not found");
  }

  sectionsSrc = replaceOne(sectionsSrc, old, replacement, "panel el helper fix");
  parseOk("sections bundle", sectionsSrc);
  return sectionsSrc + `\n/* ${MARKER}:panel */\n`;
}

// ─── Fix 2: Stop button — add stream clearing after animation ──────
function fixStopButton(monoSrc) {
  if (monoSrc.includes(MARKER + ":stop")) return monoSrc;

  // After the animation's completed upsert, before the commitChat line
  const old =
    "upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'completed'});\n" +
    "try{if(_cdrPend&&globalThis.__cdrHandoffV1)globalThis.__cdrHandoffV1.commitChat(key,_cdrPend.mark)}catch{}";

  const clearing =
    "/* " + MARKER + ":stop */\n" +
    "try{if(e&&e.streamState){if(e.streamState.streamingConversations)e.streamState.streamingConversations.delete(t);if(typeof e.streamState.clearConversationStreaming==='function')e.streamState.clearConversationStreaming(t)}if(e&&typeof e.notifyConversationUpdated==='function')e.notifyConversationUpdated(t);if(e&&typeof e.broadcastConversationSnapshot==='function')e.broadcastConversationSnapshot(t)}catch{}\n" +
    "try{window.dispatchEvent(new CustomEvent('cdr-thread-extras-change',{detail:{key:(String(t||'').includes(':')?t:'local:'+t),rows:null}}))}catch{}\n";

  const replacement =
    "upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'completed'});\n" +
    clearing +
    "try{if(_cdrPend&&globalThis.__cdrHandoffV1)globalThis.__cdrHandoffV1.commitChat(key,_cdrPend.mark)}catch{}";

  if (!monoSrc.includes(old)) {
    if (monoSrc.includes(MARKER + ":stop")) {
      console.log("[skip] stop button already fixed");
      return monoSrc;
    }
    throw new Error("stop button anchor not found — bridge may have drifted");
  }

  monoSrc = replaceOne(monoSrc, old, replacement, "stop button stream clearing");
  return monoSrc;
}

// ─── Fix 3: Transcript leak — gate codex→chat injection on !continuing ──
function fixTranscriptLeak(monoSrc) {
  if (monoSrc.includes(MARKER + ":transcript")) return monoSrc;

  // The handoff sync injects codex transcript on every chat send.
  // Gate it to only inject on the first message (!continuing).
  const old =
    "let _cdrPend=null;/* codex-rebuild:handoff-sync-v1:chat-delta */\n" +
    "try{_cdrPend=globalThis.__cdrHandoffV1?globalThis.__cdrHandoffV1.pendingForChat(key):null}catch{}";

  const replacement =
    "let _cdrPend=null;/* codex-rebuild:handoff-sync-v1:chat-delta */\n" +
    "try{if(!continuing&&globalThis.__cdrHandoffV1)_cdrPend=globalThis.__cdrHandoffV1.pendingForChat(key)}catch{}";

  if (!monoSrc.includes(old)) {
    if (monoSrc.includes("if(!continuing&&globalThis.__cdrHandoffV1)")) {
      console.log("[skip] transcript leak already fixed");
      return monoSrc;
    }
    throw new Error("transcript leak anchor not found — handoff sync may have drifted");
  }

  monoSrc = replaceOne(monoSrc, old, replacement, "gate codex→chat injection on !continuing");
  return monoSrc;
}

// ─── Fix 4: Codex resume — gate extras overlay on chat mode ─────────
function fixExtrasOverlay(threadSrc) {
  if (threadSrc.includes(MARKER + ":overlay-gate")) return threadSrc;

  // The overlay currently merges chat rows into the thread view in ALL modes.
  // In chat mode: show only chat rows (hide native codex turns).
  // In codex mode: keep only native turns (don't merge synthetic chat rows).
  const old =
    "ae=CDRMerge(ae.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped);\n" +
    "      ie=CDRMerge(ie.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped);\n" +
    "      te=!0;B=B||CDRExtraRows.some(CDRRow=>CDRRow&&CDRRow.role==='user');ne=CDRExtraMapped.at(-1)?.turnId??ne;";

  const replacement =
    "let _cdrInChat=false;try{_cdrInChat=document.documentElement.getAttribute('data-codex-product-mode')==='chat'}catch{};/* " + MARKER + ":overlay-gate */\n" +
    "      if(_cdrInChat){ae=CDRExtraMapped;ie=CDRExtraMapped;te=!0;B=B||CDRExtraRows.some(CDRRow=>CDRRow&&CDRRow.role==='user');ne=CDRExtraMapped.at(-1)?.turnId??ne}";

  if (!threadSrc.includes(old)) {
    // Try without the exact whitespace
    const oldCompact = old.replace(/\s+/g, " ").trim();
    const threadCompact = threadSrc.replace(/\s+/g, " ");
    if (threadCompact.includes(oldCompact)) {
      // The code exists but with different whitespace — do a more targeted replace
      const oldLine1 = "ae=CDRMerge(ae.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped);";
      const oldLine2 = "ie=CDRMerge(ie.filter(CDREntry=>!CDREntry?.cdrSource),CDRExtraMapped);";
      const oldLine3 = "te=!0;B=B||CDRExtraRows.some(CDRRow=>CDRRow&&CDRRow.role==='user');ne=CDRExtraMapped.at(-1)?.turnId??ne;";

      if (threadSrc.includes(oldLine1) && threadSrc.includes(oldLine2) && threadSrc.includes(oldLine3)) {
        // Replace all three lines
        const gateCode = "let _cdrInChat=false;try{_cdrInChat=document.documentElement.getAttribute('data-codex-product-mode')==='chat'}catch{};/* " + MARKER + ":overlay-gate */";
        threadSrc = threadSrc.replace(oldLine1, gateCode + "if(_cdrInChat){ae=CDRExtraMapped");
        threadSrc = threadSrc.replace(oldLine2, "ie=CDRExtraMapped");
        threadSrc = threadSrc.replace(oldLine3, "te=!0;B=B||CDRExtraRows.some(CDRRow=>CDRRow&&CDRRow.role==='user');ne=CDRExtraMapped.at(-1)?.turnId??ne}");
        parseOk("thread bundle", threadSrc);
        return threadSrc;
      }
    }
    if (threadSrc.includes(MARKER + ":overlay-gate")) {
      console.log("[skip] extras overlay already gated");
      return threadSrc;
    }
    throw new Error("extras overlay merge anchor not found — may have drifted");
  }

  threadSrc = replaceOne(threadSrc, old, replacement, "gate extras overlay on chat mode");
  parseOk("thread bundle", threadSrc);
  return threadSrc;
}

// ─── Main ───────────────────────────────────────────────────────────
function main() {
  const sectionsFile = asset((f) => f.startsWith("use-visible-settings-sections-") && f.endsWith(".js"), "use-visible-settings-sections");
  const monoFile = asset((f) => f.startsWith("app-initial-") && f.endsWith(".js"), "app-initial monolith");
  const threadFile = asset((f) => f.includes("local-conversation-thread") && f.endsWith(".js"), "local-conversation-thread");

  let sectionsSrc = fs.readFileSync(sectionsFile, "utf8");
  let monoSrc = fs.readFileSync(monoFile, "utf8");
  let threadSrc = fs.readFileSync(threadFile, "utf8");

  const origSections = sectionsSrc;
  const origMono = monoSrc;
  const origThread = threadSrc;

  // Fix 1: Panel crash
  sectionsSrc = fixPanel(sectionsSrc);
  if (sectionsSrc !== origSections) {
    console.log("[ok] fix 1: panel el helper → jsx runtime");
  }

  // Fix 2: Stop button
  monoSrc = fixStopButton(monoSrc);
  if (monoSrc !== origMono) {
    console.log("[ok] fix 2: stop button stream clearing added");
  }

  // Fix 3: Transcript leak
  monoSrc = fixTranscriptLeak(monoSrc);
  if (monoSrc !== origMono || (monoSrc === origMono && monoSrc.includes("if(!continuing&&globalThis.__cdrHandoffV1)"))) {
    // might be already applied
  }
  if (monoSrc.includes("if(!continuing&&globalThis.__cdrHandoffV1)_cdrPend")) {
    console.log("[ok] fix 3: codex→chat injection gated on !continuing");
  }

  // Fix 4: Codex resume
  threadSrc = fixExtrasOverlay(threadSrc);
  if (threadSrc !== origThread) {
    console.log("[ok] fix 4: extras overlay gated on chat mode");
  }

  // Parse-check all modified bundles
  parseOk("sections bundle", sectionsSrc);
  parseOk("monolith", monoSrc);
  parseOk("thread bundle", threadSrc);
  console.log("[ok] all bundles parse");

  // Write
  if (!process.argv.includes("--check")) {
    if (sectionsSrc !== origSections) fs.writeFileSync(sectionsFile, sectionsSrc);
    if (monoSrc !== origMono) fs.writeFileSync(monoFile, monoSrc);
    if (threadSrc !== origThread) fs.writeFileSync(threadFile, threadSrc);
  }

  // Mark applied on monolith
  if (!monoSrc.includes(MARKER + ":applied") && !process.argv.includes("--check")) {
    fs.appendFileSync(monoFile, `\n/* ${MARKER}:applied */\n`);
  }

  console.log(process.argv.includes("--check") ? "bugfix-v1 check ok" : "bugfix-v1 patched");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { MARKER, fixPanel, fixStopButton, fixTranscriptLeak, fixExtrasOverlay };
