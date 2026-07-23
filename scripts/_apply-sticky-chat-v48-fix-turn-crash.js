#!/usr/bin/env node
"use strict";
/**
 * v48: Fix "Error creating chat / reading 'turn'" WITHOUT removing sticky Chat features.
 *
 * Root cause (v47 regression):
 *   extras-tick returned a FILTERED copy of renderEntries/visibleTurnEntries even when
 *   extras were empty:
 *     renderEntries.filter(e => e && (e.turn || e.type==='gap' || e.turnKey!=null))
 *   That dropped legitimate native timeline/render rows. Downstream code then did
 *   .map(({turn}) => ...) / .find(({turn}) => ...) on undefined → toast via Fo():
 *   "Error creating chat\\nCannot read properties of undefined (reading 'turn')".
 *
 * Keep:
 *   - sticky /local continuity
 *   - ChatGPT usage bridge
 *   - discrete Chat picker
 *   - cdr-thread-extras → transcript (turns-merge + UI extras-tick)
 *
 * Fix:
 *   - empty extras / already-merged: return base UNCHANGED
 *   - merge path: never strip native render rows; only drop prior cdr overlays
 *   - harden a few native {turn} destructures as seatbelts
 *   - keep turns-merge item shapes (content[] + turnId)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v48";

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
      const line = String(src).split("\n")[Number(m[1]) - 1] || String(src);
      const col = Number(m[2]);
      ctx =
        "\n  near: " +
        JSON.stringify(line.slice(Math.max(0, col - 80), col + 80));
    }
    throw new Error(`${label}: ${err.message}${ctx}`);
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

const MAP_ENTRY =
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
  "}).filter(e=>e&&e.turn&&Array.isArray(e.turn.items));";

function extrasTickIife() {
  return (
    "(()=>{/* " +
    MARKER +
    ":extras-tick */void CDRExtrasTick;" +
    "let base=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l});" +
    "try{" +
    "let key=`local:`+e;" +
    "let extras=JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`);" +
    // CRITICAL: do not touch native lists when there is nothing to merge
    "if(!Array.isArray(extras)||!extras.length)return base;" +
    "let baseVis=(base.visibleTurnEntries||[]).filter(e=>e&&e.turn);" +
    // Fa already ingested via turns-merge — keep native renderEntries intact
    "if(baseVis.some(e=>e.cdrSource||e.turn&&e.turn.cdrSource))return base;" +
    MAP_ENTRY +
    "let B=[...baseVis.filter(e=>!e.cdrSource&&!(e.turn&&e.turn.cdrSource)),...mapped];" +
    // Keep every native render row; only strip prior cdr overlays, then append
    "let z=[...(base.renderEntries||[]).filter(e=>e&&!e.cdrSource),...mapped];" +
    "return{...base,hasRenderableTurns:!0,hasUserMessage:base.hasUserMessage||extras.some(x=>x&&x.role===`user`),visibleTurnEntries:B,renderEntries:z}" +
    "}catch{return base}" +
    "})()"
  );
}

function patchLocal(src) {
  let out = src;

  // Keep/refresh gS guard
  if (!out.includes(":gs-guard")) {
    out = replaceOnce(
      out,
      "function gS(e,t){for(let n=e.length-1;n>=0;--n){let r=e[n];if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}",
      "function gS(e,t){/* " +
        MARKER +
        ":gs-guard */for(let n=e.length-1;n>=0;--n){let r=e[n];if(!r||!r.turn)continue;if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}",
      "gS guard",
    );
  } else if (!out.includes(MARKER + ":gs-guard")) {
    out = out.replace(/sticky-chat-v4[67]:gs-guard/g, MARKER + ":gs-guard");
  }

  if (
    out.includes(MARKER + ":extras-tick") &&
    out.includes("if(!Array.isArray(extras)||!extras.length)return base;") &&
    !out.includes("e.type===`gap`||e.turn==null") &&
    !out.includes("(e.turn||e.type===`gap`||e.turnKey!=null)")
  ) {
    console.log("local already v48");
  } else {
    let tickStart = -1;
    for (const m of [
      "/* codex-rebuild:sticky-chat-v48:extras-tick */",
      "/* codex-rebuild:sticky-chat-v47:extras-tick */",
      "/* codex-rebuild:sticky-chat-v46:extras-tick */",
      "/* codex-rebuild:sticky-chat-v43:extras-tick */",
    ]) {
      tickStart = out.indexOf(m);
      if (tickStart >= 0) break;
    }
    assert(tickStart >= 0, "extras-tick marker missing");
    const iifeStart = out.lastIndexOf("(()=>{", tickStart);
    const after = out.indexOf("})(),V=B.at(-1)", tickStart);
    assert(iifeStart > 0 && after > tickStart, "extras IIFE bounds missing");
    out =
      out.slice(0, iifeStart) +
      extrasTickIife() +
      out.slice(after + "})()".length);
  }

  // Harden local find({turn})
  const oldFind =
    ".find(({turn:n})=>n.items.some(n=>n.type===`agentMessage`&&qt(e,n.id)===t))";
  if (out.includes(oldFind) && !out.includes(MARKER + ":harden-find")) {
    out = replaceOnce(
      out,
      oldFind,
      ".find(n=>n&&n.turn&&Array.isArray(n.turn.items)&&n.turn.items.some(n=>n.type===`agentMessage`&&qt(e,n.id)===t))/* " +
        MARKER +
        ":harden-find */",
      "harden find turn",
    );
  }

  assert(!out.includes("(e.turn||e.type===`gap`||e.turnKey!=null)"), "v47 destructive filter still present");
  assert(out.includes("if(!Array.isArray(extras)||!extras.length)return base;"), "empty-extras must return base");
  return out;
}

function patchTurns(src) {
  let out = src;

  // Ensure turns-merge still present and uses turnId + content[]
  assert(out.includes("cdr-thread-extras:`+key"), "turns-merge missing — do not remove feature");

  // Refresh mapped block to v48 shape if needed
  if (!out.includes(MARKER + ":turns-merge")) {
    const extrasKey = out.indexOf("cdr-thread-extras:`+key");
    const mapStart = out.indexOf("let mapped=extras.map(", extrasKey);
    const ret = out.indexOf(";return base.concat(mapped)", mapStart);
    assert(mapStart > 0 && ret > mapStart, "mapped block missing");
    const newMap =
      "let mapped=extras.map((x,i)=>{" +
      "if(!x||typeof x!==`object`)return null;" +
      "let text=String(x.text||``);" +
      "let isUser=x.role===`user`;" +
      "let item=isUser" +
      "?{id:`cdr-extra-item-`+i,type:`userMessage`,content:[{type:`text`,text,text_elements:[]}]}" +
      ":{id:`cdr-extra-item-`+i,type:`agentMessage`,text};" +
      "let id=`cdr-extra-`+i+`-`+(x.ts||i);" +
      "return{id,turnId:id,status:`completed`,turnStartedAtMs:Number(x.ts)||Date.now(),items:[item],cdrSource:x.source||`chat`}" +
      "}).filter(e=>e&&Array.isArray(e.items));/* " +
      MARKER +
      ":turns-merge */";
    out = out.slice(0, mapStart) + newMap + out.slice(ret);
    // concat should skip holes
    out = out.replace(
      ";return base.concat(mapped)",
      ";return (base||[]).concat(mapped).filter(e=>e&&Array.isArray(e.items))",
    );
  }

  // Seatbelts on native destructures (2 maps + 1 filter)
  if (!out.includes(MARKER + ":harden-turn-map")) {
    out = replaceOnce(
      out,
      "i=r.visibleTurnEntries.filter(({turn:e})=>e.items.some(e=>e.type===`imageGeneration`&&e.src!=null))",
      "i=r.visibleTurnEntries.filter(e=>e&&e.turn&&Array.isArray(e.turn.items)&&e.turn.items.some(e=>e.type===`imageGeneration`&&e.src!=null))/* " +
        MARKER +
        ":harden-turn-map */",
      "harden image filter",
    );
  }

  if (!out.includes(MARKER + ":harden-ao-map")) {
    const old =
      "i.map(({preserveServerUserMessages:e,requests:n,turn:r})=>fe(r,n,{isBackgroundSubagentsEnabled:t,preserveServerUserMessages:e}))";
    if (out.includes(old)) {
      out = replaceOnce(
        out,
        old,
        "i.filter(e=>e&&e.turn).map(({preserveServerUserMessages:e,requests:n,turn:r})=>fe(r,n,{isBackgroundSubagentsEnabled:t,preserveServerUserMessages:e}))/* " +
          MARKER +
          ":harden-ao-map */",
        "harden ao map",
      );
    }
  }

  // Only the berry za helpers use this exact pattern (2 occurrences)
  if (!out.includes(MARKER + ":harden-za-map")) {
    const n = out.split(".map(({turn:e})=>e)").length - 1;
    assert(n === 2, `expected 2 za turn maps, got ${n}`);
    out = out.replace(
      ".map(({turn:e})=>e)",
      ".filter(e=>e&&e.turn).map(({turn:e})=>e)",
    );
    // mark once near first
    out = out.replace(
      ".filter(e=>e&&e.turn).map(({turn:e})=>e)",
      ".filter(e=>e&&e.turn).map(({turn:e})=>e)/* " + MARKER + ":harden-za-map */",
    );
  }

  return out;
}

function verify(local, turns) {
  assert(local.includes(MARKER + ":extras-tick"), "extras-tick missing");
  assert(local.includes("if(!Array.isArray(extras)||!extras.length)return base;"), "must return base when empty");
  assert(!local.includes("(e.turn||e.type===`gap`||e.turnKey!=null)"), "destructive empty filter must be gone");
  assert(turns.includes("cdr-thread-extras:`+key"), "turns-merge feature must remain");
  assert(turns.includes(MARKER + ":turns-merge") || turns.includes("turnId:id"), "turns shape ok");
  assert(turns.includes(MARKER + ":harden-turn-map"), "harden-turn-map missing");
  assert(local.includes("content:[{type:`text`") || turns.includes("content:[{type:`text`"), "userMessage content shape");
  parseOk("local", local);
  parseOk("turns", turns);
  console.log("verify ok — features kept, destructive filter removed");
}

function install() {
  const packed = path.join(ROOT, "out", "app-sticky-chat-v48.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v48-${Date.now()}`);
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
console.log("wrote patches");

if (process.argv.includes("--check")) process.exit(0);

install();
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});
console.log(
  "\nSUCCESS — fully quit Codex, reopen.\n" +
    "Fixed v47 empty-extras filter that stripped native renderEntries and caused reading 'turn'.\n" +
    "Sticky Chat extras merge + bridge kept.",
);
