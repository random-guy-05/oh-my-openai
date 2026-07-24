#!/usr/bin/env node
"use strict";

/**
 * v62: Per-turn usage badge beside copy/fork actions.
 *
 * The existing CDRTaskUsageBadge (v61) shows cumulative task-level usage.
 * This patch adds a CDRTurnUsageBadge that shows ONLY the tokens consumed
 * by the specific turn (message) whose action bar it appears on.
 *
 * Key design: usage.last (from __cdrUsageV1.summary) contains the exact
 * token counts for the most recent API response on that thread. Since
 * token counts are per-thread and exact (not account-wide deltas), they
 * are not affected by other threads running in parallel.
 *
 * The badge captures usage.last via a useRef snapshot. To avoid capturing
 * stale data from a previous turn, it waits 300ms after mount before the
 * first capture attempt, giving the thread/tokenUsage/updated event time
 * to fire. It also caches snapshots in globalThis.__cdrTurnUsage keyed by
 * threadId:turnId so that re-mounts (scrolling, virtualisation) recover the
 * same value instantly.
 */

const acorn = require("acorn");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = process.env.CDR_ASAR_ROOT
  ? path.resolve(process.env.CDR_ASAR_ROOT)
  : path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:per-turn-usage-v62";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  assert(count === 1, `${label}: expected 1 match, found ${count}`);
  return source.replace(from, to);
}

function parseOk(label, source) {
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

function asset(namePart) {
  const name = fs
    .readdirSync(ASSETS)
    .find((entry) => entry.includes(namePart) && entry.endsWith(".js"));
  if (!name) throw new Error(`Missing asset containing ${namePart}`);
  return path.join(ASSETS, name);
}

/**
 * CDRTurnUsageBadge — shows per-turn token usage.
 *
 * Placed beside CDRTaskUsageBadge in the assistant message action row.
 * Unlike the task badge (cumulative), this shows tokens for JUST this
 * turn: input, cached, output, reasoning, and total.
 *
 * Uses useRef to snapshot usage.last once, then freezes it. A 300ms delay
 * before first capture avoids grabbing stale data from a prior turn.
 * Listens to cdr-usage-change events filtered to THIS thread only.
 * Snapshots are cached in globalThis.__cdrTurnUsage for re-mount recovery.
 */
const TURN_USAGE_BADGE = `
function CDRTurnUsageBadge({threadId,turnId}){/* ${MARKER} */
let CDRSnap=(0,hT.useRef)(null),[,CDRSetTick]=(0,hT.useState)(0);
(0,hT.useEffect)(()=>{
let key=String(threadId)+":"+String(turnId);
if(!globalThis.__cdrTurnUsage)globalThis.__cdrTurnUsage={};
if(globalThis.__cdrTurnUsage[key])CDRSnap.current=globalThis.__cdrTurnUsage[key];
let _k=Object.keys(globalThis.__cdrTurnUsage);if(_k.length>200){for(let _i=0;_i<_k.length-200;_i++)delete globalThis.__cdrTurnUsage[_k[_i]]}
let CDRCapture=()=>{
if(CDRSnap.current!=null)return;
try{
let s=globalThis.__cdrUsageV1?.summary(threadId);
if(s?.usage?.last&&s.usage.last.totalTokens>0){
let l=s.usage.last;
CDRSnap.current={inputTokens:l.inputTokens||0,cachedInputTokens:l.cachedInputTokens||0,outputTokens:l.outputTokens||0,reasoningOutputTokens:l.reasoningOutputTokens||0,totalTokens:l.totalTokens||0};
globalThis.__cdrTurnUsage[key]=CDRSnap.current;
CDRSetTick(v=>v+1)
}
}catch{}
};
let CDRTimer=setTimeout(CDRCapture,300);
let CDRListener=(e)=>{
let d=e?.detail;
if(d?.threadKey===threadId||(Array.isArray(d?.aliases)&&d.aliases.includes(threadId)))CDRCapture()
};
try{window.addEventListener("cdr-usage-change",CDRListener)}catch{}
return()=>{clearTimeout(CDRTimer);try{window.removeEventListener("cdr-usage-change",CDRListener)}catch{}}
},[threadId,turnId]);
let tu=CDRSnap.current;
if(!tu||tu.totalTokens===0)return null;
let fmt=e=>Number(e||0).toLocaleString();
let parts=[];
if(tu.inputTokens>0)parts.push("in "+fmt(tu.inputTokens));
if(tu.cachedInputTokens>0)parts.push("cached "+fmt(tu.cachedInputTokens));
if(tu.outputTokens>0)parts.push("out "+fmt(tu.outputTokens));
if(tu.reasoningOutputTokens>0)parts.push("reason "+fmt(tu.reasoningOutputTokens));
parts.push("= "+fmt(tu.totalTokens));
return(0,gT.jsx)("span",{className:"ml-1.5 select-none whitespace-nowrap text-xs tabular-nums text-token-text-tertiary",title:"Tokens for this turn only — not affected by parallel tasks","aria-label":"Turn usage: "+parts.join(", "),children:parts.join(" · ")})
}`;

function patchActionRow(source) {
  // Idempotency: skip if already patched
  if (source.includes(MARKER)) {
    return source;
  }

  // 1. Inject CDRTurnUsageBadge definition before the iT function
  //    (same insertion point used by v61 for CDRTaskUsageBadge)
  source = replaceOnce(
    source,
    "function iT(e){",
    TURN_USAGE_BADGE + "function iT(e){",
    "install turn usage badge",
  );

  // 2. Insert CDRTurnUsageBadge next to CDRTaskUsageBadge in the render tree.
  //    The existing anchor from v61:
  //    (0,gT.jsx)(CDRTaskUsageBadge,{threadId:y}),a==null?null:(0,gT.jsx)(qy,{stats:a})
  //
  //    We insert CDRTurnUsageBadge between the task badge and the stats:
  //    (0,gT.jsx)(CDRTaskUsageBadge,{threadId:y}),(0,gT.jsx)(CDRTurnUsageBadge,{threadId:y,turnId:i}),a==null?null:(0,gT.jsx)(qy,{stats:a})
  //
  //    'y' is threadId and 'i' is turnId, both destructured in iT's params.
  const oldAnchor =
    "(0,gT.jsx)(CDRTaskUsageBadge,{threadId:y}),a==null?null:(0,gT.jsx)(qy,{stats:a})";
  const newAnchor =
    "(0,gT.jsx)(CDRTaskUsageBadge,{threadId:y}),(0,gT.jsx)(CDRTurnUsageBadge,{threadId:y,turnId:i}),a==null?null:(0,gT.jsx)(qy,{stats:a})";

  if (source.includes(oldAnchor)) {
    source = replaceOnce(source, oldAnchor, newAnchor, "place turn usage badge");
  } else {
    // Fallback: the v61 anchor may use a slightly different variable name.
    // Try matching just the CDRTaskUsageBadge placement and inject after it.
    const fallback =
      "(0,gT.jsx)(CDRTaskUsageBadge,{threadId:y})";
    assert(
      source.includes(fallback),
      "CDRTaskUsageBadge placement anchor not found — v61 action row patch may be missing",
    );
    source = replaceOnce(
      source,
      fallback,
      fallback + ",(0,gT.jsx)(CDRTurnUsageBadge,{threadId:y,turnId:i})",
      "place turn usage badge (fallback)",
    );
  }

  parseOk("action row", source);
  return source;
}

function verify(source) {
  assert(source.includes(MARKER), "per-turn-usage marker missing");
  assert(
    source.includes("CDRTurnUsageBadge"),
    "CDRTurnUsageBadge function missing",
  );
  assert(
    source.includes("CDRTurnUsageBadge,{threadId:y,turnId:i}"),
    "CDRTurnUsageBadge placement missing",
  );
  assert(
    source.includes("CDRSnap.current"),
    "useRef snapshot pattern missing",
  );
  parseOk("action row", source);
}

function main() {
  const actionsPath = asset("c33rimzq");
  let source = fs.readFileSync(actionsPath, "utf8");

  // Verify v61 prerequisite
  assert(
    source.includes("CDRTaskUsageBadge"),
    "c33rimzq missing CDRTaskUsageBadge — run _apply-same-task-chat-v60.js first",
  );

  source = patchActionRow(source);
  verify(source);

  if (process.argv.includes("--check")) {
    console.log("v62 check ok");
    return;
  }

  fs.writeFileSync(actionsPath, source);
  console.log("v62 sources written — per-turn usage badge installed");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { TURN_USAGE_BADGE, patchActionRow, verify, MARKER };
