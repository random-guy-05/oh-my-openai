#!/usr/bin/env node
"use strict";
/**
 * v47: Fix STILL "Cannot read properties of undefined (reading 'turn')"
 *
 * v46 left a fatal filter bug in extras-tick:
 *   .filter(e=>!e||!e.cdrSource)  // KEEPS null/undefined
 * Native code then does visibleTurnEntries.filter(({turn:e})=>...) /
 * map(({turn:r})=>...) which throws exactly "reading 'turn'" on undefined rows.
 *
 * Also: turns-merge used `id` but Fa/Ia reads `turnId`; and extras were
 * merged twice (conversationTurns + UI tick).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:sticky-chat-v47";

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
      const lines = String(src).split("\n");
      const line = lines[Number(m[1]) - 1] || String(src);
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

const MAP_ENTRY =
  "let mapped=extras.map((x,i)=>{" +
  "if(!x||typeof x!==`object`)return null;" +
  "let isUser=x.role===`user`;" +
  "let item=isUser" +
  "?{id:`cdr-extra-item-`+i,type:`userMessage`,content:[{type:`text`,text:String(x.text||``),text_elements:[]}]}" +
  ":{id:`cdr-extra-item-`+i,type:`agentMessage`,text:String(x.text||``)};" +
  "let id=`cdr-extra-`+i+`-`+(x.ts||i);" +
  "let turn={id,turnId:id,status:`completed`,turnStartedAtMs:x.ts||Date.now(),items:[item],cdrSource:x.source||`chat`};" +
  "return{physicalTurnIds:[],preserveServerUserMessages:!1,requests:[],turn,turnId:id,turnIndex:1e6+i,turnKey:id,turnSearchKey:id,estimatedHeightPx:96,cdrSource:x.source||`chat`}" +
  "}).filter(e=>e&&e.turn);";

const MAP_TURN =
  "let mapped=extras.map((x,i)=>{" +
  "if(!x||typeof x!==`object`)return null;" +
  "let isUser=x.role===`user`;" +
  "let item=isUser" +
  "?{id:`cdr-extra-item-`+i,type:`userMessage`,content:[{type:`text`,text:String(x.text||``),text_elements:[]}]}" +
  ":{id:`cdr-extra-item-`+i,type:`agentMessage`,text:String(x.text||``)};" +
  "let id=`cdr-extra-`+i+`-`+(x.ts||i);" +
  "return{id,turnId:id,status:`completed`,turnStartedAtMs:x.ts||Date.now(),items:[item],cdrSource:x.source||`chat`}" +
  "}).filter(e=>e&&Array.isArray(e.items));";

function extrasTickIife() {
  return (
    "(()=>{/* " +
    MARKER +
    ":extras-tick */void CDRExtrasTick;let base=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l});try{let key=`local:`+e;let extras=JSON.parse(localStorage.getItem(`cdr-thread-extras:`+key)||`[]`);if(!Array.isArray(extras)||!extras.length)return{...base,visibleTurnEntries:(base.visibleTurnEntries||[]).filter(e=>e&&e.turn),renderEntries:(base.renderEntries||[]).filter(e=>e&&(e.turn||e.type===`gap`||e.turnKey!=null))};" +
    // If Fa already ingested cdr turns via turns-merge, only sanitize
    "let baseVis=(base.visibleTurnEntries||[]).filter(e=>e&&e.turn);" +
    "if(baseVis.some(e=>e.cdrSource||e.turn&&e.turn.cdrSource))return{...base,visibleTurnEntries:baseVis,renderEntries:(base.renderEntries||[]).filter(e=>e&&(e.turn||e.type===`gap`||e.turnKey!=null))};" +
    MAP_ENTRY +
    "let B=[...baseVis.filter(e=>!e.cdrSource&&!(e.turn&&e.turn.cdrSource)),...mapped];" +
    "let gaps=(base.renderEntries||[]).filter(e=>e&&(e.type===`gap`||!e.turn&&e.turnKey!=null&&!e.cdrSource));" +
    "let z=[...gaps,...B].filter(e=>e&&(e.turn||e.type===`gap`||e.turnKey!=null));" +
    "return{...base,hasRenderableTurns:!0,hasUserMessage:base.hasUserMessage||extras.some(x=>x&&x.role===`user`),visibleTurnEntries:B,renderEntries:z}}catch{return{...base,visibleTurnEntries:(base.visibleTurnEntries||[]).filter(e=>e&&e.turn),renderEntries:(base.renderEntries||[]).filter(e=>e&&(e.turn||e.type===`gap`||e.turnKey!=null))}}})()"
  );
}

function patchLocal(src) {
  let out = src;

  // Keep gs-guard (v46 or v47)
  if (!out.includes("sticky-chat-v46:gs-guard") && !out.includes(MARKER + ":gs-guard")) {
    out = replaceOnce(
      out,
      "function gS(e,t){for(let n=e.length-1;n>=0;--n){let r=e[n];if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}",
      "function gS(e,t){/* " +
        MARKER +
        ":gs-guard */for(let n=e.length-1;n>=0;--n){let r=e[n];if(!r||!r.turn)continue;if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}",
      "gS guard",
    );
  } else if (out.includes("sticky-chat-v46:gs-guard") && !out.includes(MARKER + ":gs-guard")) {
    out = out.replace("sticky-chat-v46:gs-guard", MARKER + ":gs-guard");
  }

  if (
    out.includes(MARKER + ":extras-tick") &&
    out.includes("filter(e=>e&&e.turn)") &&
    !out.includes("filter(e=>!e||!e.cdrSource)")
  ) {
    console.log("local already v47");
    return out;
  }

  // Replace whatever extras-tick IIFE is currently there (v43 or v46)
  let tickStart = out.indexOf("/* codex-rebuild:sticky-chat-v46:extras-tick */");
  if (tickStart < 0) tickStart = out.indexOf("/* " + MARKER + ":extras-tick */");
  if (tickStart < 0)
    tickStart = out.indexOf("/* codex-rebuild:sticky-chat-v43:extras-tick */");
  assert(tickStart >= 0, "extras-tick marker missing — run v43/v46 first");

  const iifeStart = out.lastIndexOf("(()=>{", tickStart);
  const after = out.indexOf("})(),V=B.at(-1)", tickStart);
  assert(iifeStart > 0 && after > tickStart, "extras IIFE bounds missing");
  out = out.slice(0, iifeStart) + extrasTickIife() + out.slice(after + "})()".length);

  // Hard fail if bad filter remains
  assert(!out.includes("filter(e=>!e||!e.cdrSource)"), "bad filter still present");
  return out;
}

function patchTurns(src) {
  let out = src;
  if (
    out.includes(MARKER + ":turns-merge") &&
    out.includes("turnId:id") &&
    out.includes(".filter(e=>e&&Array.isArray(e.items))")
  ) {
    console.log("turns already v47");
    return out;
  }

  const extrasKey = out.indexOf("cdr-thread-extras:`+key");
  assert(extrasKey >= 0, "turns extras merge missing");
  const mapStart = out.indexOf("let mapped=extras.map(", extrasKey);
  // v43 ends with `);return`, v46 with `})/* marker */;return`
  const ret = out.indexOf(";return base.concat(mapped)", mapStart);
  assert(mapStart > 0 && ret > mapStart, "mapped block missing");

  const newMap = MAP_TURN + "/* " + MARKER + ":turns-merge */";
  out = out.slice(0, mapStart) + newMap + out.slice(ret);
  return out;
}

function verify(local, turns) {
  assert(local.includes(MARKER + ":extras-tick"), "extras-tick missing");
  assert(local.includes("filter(e=>e&&e.turn)"), "sanitize filter missing");
  assert(!local.includes("filter(e=>!e||!e.cdrSource)"), "bad inverted filter still present");
  assert(turns.includes(MARKER + ":turns-merge"), "turns-merge missing");
  assert(turns.includes("turnId:id"), "turnId missing on mapped turns");
  assert(local.includes("content:[{type:`text`"), "userMessage content shape missing");
  parseOk("local", local);
  parseOk("turns", turns);
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-sticky-chat-v47.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  console.log("packing", packed);
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of LIVE) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v47-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest, fs.statSync(dest).size);
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
    "Fixed inverted filter that kept undefined rows; sanitize visibleTurnEntries; turnId on Chat extras.",
);

