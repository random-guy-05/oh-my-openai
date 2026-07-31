#!/usr/bin/env node
"use strict";

/**
 * Transcript publisher v1 — codex→chat context handoff.
 *
 * Injects two things into the local-conversation-thread bundle:
 *
 * 1. An event dispatch in the OD component (which receives
 *    `visibleTurnEntries` and `conversationId` as props). After kD
 *    processes the entries, it dispatches a `cdr-publish-transcript`
 *    CustomEvent carrying the native codex turn entries.
 *
 * 2. A self-contained IIFE at the end of the file that listens for
 *    `cdr-publish-transcript` events, serializes the entries into a
 *    <codex_transcript> block, and publishes it to
 *    globalThis.__cdrCodexContextByThread so CDRStickyChatSend can
 *    prepend it as context on the first chat send.
 *
 * This replaces the disabled publisher in _apply-26721-all-features.js
 * (section 5) which was gated with `if (false && ...)` due to a template
 * literal escaping bug. This script avoids the issue by constructing
 * the injected code from a string array with explicit \n escapes.
 */

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:transcript-publisher-v1";

function findThreadFile() {
  const files = fs.readdirSync(ASSETS);
  const name = files.find(
    (f) => f.includes("local-conversation-thread") && f.endsWith(".js"),
  );
  return name ? path.join(ASSETS, name) : null;
}

function parseOk(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
}

// OD component anchor: after the let declaration that processes
// visibleTurnEntries. OD receives conversationId:n and renderEntries:C
// as props. The kD call uses visibleTurnEntries:i (where i is
// generatedImageTurnEntries from the destructuring).
//
// CRITICAL: the kD call is part of a multi-variable `let` declaration:
//   let ...T=h.filter(vg),E=...null,D=C.filter(...),O=kD({...}),k=[],A=new Map,j=null,M=0,N=0;for(let i of C){...}
// We CANNOT inject inside the let declaration — the parser expects an
// identifier (not an IIFE) after each comma in a let. Instead, we inject
// AFTER the let declaration ends (at N=0;) and BEFORE the for loop.
// We pass entries:C (renderEntries) since those are the actual rendered
// turn entries that the for loop iterates over.
const OD_ANCHOR =
  "M=0,N=0;for(let i of C){if(Oo(i)){let e=w.get(i.turnKey)";
const OD_REPLACEMENT =
  "M=0,N=0;try{window.dispatchEvent(new CustomEvent('cdr-publish-transcript',{detail:{key:'local:'+n,entries:C}}))}catch{}for(let i of C){if(Oo(i)){let e=w.get(i.turnKey)";

// 26.727's thread renderer no longer exposes the old OD loop anchor. The
// modern XO component already has the visible Codex entries (`te`) and thread
// id (`e`), so publish from that stable render point instead.
const MODERN_XO_ANCHOR = "renderEntries:ee}),ze=";
const MODERN_XO_REPLACEMENT =
  "renderEntries:ee});try{window.dispatchEvent(new CustomEvent('cdr-publish-transcript',{detail:{key:'local:'+e,entries:te}}))}catch{};let ze=";

// Publisher IIFE — built from a string array to avoid template literal
// escaping issues. Each element is a line of JavaScript. Inside string
// literals, \\n produces \n (backslash-n = newline escape) in the output.
const PUBLISHER_LINES = [
  "/* " + MARKER + ":applied */",
  "(function CDRPublishTranscript(){",
  "if(globalThis.__cdrTranscriptPublisher)return;globalThis.__cdrTranscriptPublisher=!0;",
  "function textOf(v){if(v==null)return'';if(typeof v==='string')return v;if(Array.isArray(v))return v.map(textOf).filter(Boolean).join('\\n');if(typeof v==='object'){if(typeof v.text==='string')return v.text;if(typeof v.content==='string')return v.content;for(let k of ['message','agentMessage','userMessage','output_text']){let f=textOf(v[k]);if(f)return f}if(Array.isArray(v.parts))return v.parts.map(textOf).filter(Boolean).join('');if(Array.isArray(v.content))return v.content.map(textOf).filter(Boolean).join('\\n')}return''}",
  "try{window.addEventListener('cdr-publish-transcript',function(ev){",
  "try{",
  "let d=ev&&ev.detail;if(!d||!d.key||!d.entries)return;",
  "let key=d.key,entries=d.entries;",
  "let lines=[];",
  "for(let entry of Array.isArray(entries)?entries:[]){",
  "let turn=entry&&entry.turn||entry;",
  "let items=Array.isArray(turn&&turn.items)?turn.items:[];",
  "for(let item of items){",
  "let body=textOf(item).trim();",
  "if(!body)continue;",
  "let role=item&&(item.type==='userMessage'||item.role==='user')?'User':'Assistant';",
  "let line=role+': '+body;",
  "if(lines[lines.length-1]!==line)lines.push(line)}}",
  "if(!lines.length)return;",
  "let transcript=lines.join('\\n\\n---\\n\\n');",
  "let max=36e4;",
  "if(transcript.length>max)transcript=transcript.slice(0,3e4)+'\\n\\n[Middle of transcript omitted only to stay within the model context window.]\\n\\n'+transcript.slice(-(max-3e4));",
  "let text='You are continuing an existing Codex task in Chat mode. The transcript below is authoritative prior conversation context. Continue naturally from it, preserve decisions and constraints, and do not mention this handoff unless the user asks.\\n\\n<codex_transcript>\\n'+transcript+'\\n</codex_transcript>';",
  "try{globalThis.__cdrHandoffV1&&globalThis.__cdrHandoffV1.recordCodex(key,lines)}catch{}",
  "globalThis.__cdrCodexContextByThread=globalThis.__cdrCodexContextByThread||{};",
  "globalThis.__cdrCodexContextByThread[key]={text:text,turnCount:lines.length,updatedAt:Date.now()}",
  "}catch{}})}catch{}",
  "})();",
];

const PUBLISHER_IIFE = PUBLISHER_LINES.join("\n");

// ─── Main ───

const threadFile = findThreadFile();
if (!threadFile) {
  console.log("[warn] transcript-publisher-v1: thread file not found, skipping");
  process.exit(0);
}

let threadSrc = fs.readFileSync(threadFile, "utf8");

if (threadSrc.includes(MARKER + ":applied")) {
  console.log("[skip] transcript-publisher-v1: already applied");
  process.exit(0);
}

// 1. Inject OD event dispatch
if (threadSrc.includes(OD_ANCHOR)) {
  const count = threadSrc.split(OD_ANCHOR).length - 1;
  if (count === 1) {
    threadSrc = threadSrc.replace(OD_ANCHOR, OD_REPLACEMENT);
    console.log("[ok] transcript-publisher-v1: OD event dispatch injected");
  } else {
    console.log(
      `[warn] transcript-publisher-v1: OD anchor found ${count} times, skipping event dispatch`,
    );
  }
} else {
  if (threadSrc.includes(MODERN_XO_ANCHOR)) {
    const count = threadSrc.split(MODERN_XO_ANCHOR).length - 1;
    if (count === 1) {
      threadSrc = threadSrc.replace(MODERN_XO_ANCHOR, MODERN_XO_REPLACEMENT);
      console.log("[ok] transcript-publisher-v1: modern XO event dispatch injected");
    } else {
      console.log(`[warn] transcript-publisher-v1: modern XO anchor found ${count} times, skipping event dispatch`);
    }
  } else {
    console.log("[warn] transcript-publisher-v1: OD/modern XO anchor not found, skipping event dispatch");
  }
}

// 2. Inject publisher IIFE at end of file
threadSrc = threadSrc + "\n" + PUBLISHER_IIFE + "\n";

// 3. Parse check
try {
  parseOk("thread file", threadSrc);
  console.log("[ok] transcript-publisher-v1: thread file parses OK");
} catch (e) {
  console.log(
    `[warn] transcript-publisher-v1: parse warning: ${e.message.slice(0, 200)}`,
  );
}

// 4. Write back
if (!process.argv.includes("--check")) {
  fs.writeFileSync(threadFile, threadSrc);
  console.log("[ok] transcript-publisher-v1: written to thread file");
} else {
  console.log("[ok] transcript-publisher-v1: check complete (no files written)");
}
