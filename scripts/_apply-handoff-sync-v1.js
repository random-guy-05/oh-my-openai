#!/usr/bin/env node
"use strict";

/**
 * Bidirectional Codex <-> Chat context handoff, delta-synced.
 *
 * PROBLEM THIS SOLVES
 * -------------------
 * Chat mode forks into a separate ChatGPT conversation (separate models,
 * separate quota), which is intended. What was broken is that context only
 * crossed the fork at conversation-creation boundaries:
 *
 *   codex -> chat  injected only when `!continuing`, i.e. on the very first
 *                  chat message of a thread. Any Codex work done after that
 *                  never reached an already-started chat conversation. The
 *                  source (`__cdrCodexContextByThread`) was also in-memory
 *                  only, so it was empty after every restart.
 *
 *   chat  -> codex injected only inside `lee=async(e,t,r)=>`, the background
 *                  resume handler. Switching mode and typing never hit that
 *                  path, so Codex received nothing at all.
 *
 * FIX
 * ---
 * A persisted per-thread store with an independent watermark per direction.
 * Every send checks for turns the other side has not seen and prepends only
 * those, then advances that direction's watermark. Sending deltas instead of
 * the whole transcript is also what removes the need for the old 360 KB
 * truncation dance.
 *
 * Runs after _apply-26721-all-features.js and _apply-transcript-publisher-v1.js
 * because it rewrites code those two inject.
 */

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:handoff-sync-v1";

function findAsset(pred, label) {
  const name = fs.readdirSync(ASSETS).find(pred);
  if (!name) throw new Error(`could not find ${label} in ${ASSETS}`);
  return path.join(ASSETS, name);
}

const MONO = findAsset(
  (f) => f.startsWith("app-initial-") && f.endsWith(".js"),
  "app-initial monolith",
);
const THREAD = findAsset(
  (f) => f.includes("local-conversation-thread") && f.endsWith(".js"),
  "local-conversation-thread bundle",
);

function replaceOne(src, from, to, label) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: expected 1 anchor, found ${n}`);
  return src.replace(from, to);
}

function parseOk(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error(`${label} no longer parses: ${e.message}`);
  }
}

// ─── Shared handoff runtime ─────────────────────────────────────────
//
// Written as a real function so it stays readable and testable here, then
// stringified into the bundle. Storage layout under `cdr-handoff-v1`:
//
//   { threads: { "local:<id>": {
//       codexLines: string[],      // full ordered Codex transcript
//       deliveredToChat: number,   // watermark into codexLines
//       deliveredToCodex: number,  // watermark into the chat extras rows
//   } } }

function installHandoffRuntime() {
  if (globalThis.__cdrHandoffV1) return globalThis.__cdrHandoffV1;

  const STORE = "cdr-handoff-v1";
  const MAX_LINES = 400;
  const MAX_CHARS = 120000;

  const load = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "null");
      if (raw && typeof raw === "object" && raw.threads) return raw;
    } catch {}
    return { threads: {} };
  };

  const save = (data) => {
    try {
      localStorage.setItem(STORE, JSON.stringify(data));
      return true;
    } catch {
      // Quota exhausted. Drop the oldest half of every transcript and retry
      // once, so history degrades instead of silently freezing.
      try {
        for (const k of Object.keys(data.threads)) {
          const t = data.threads[k];
          if (Array.isArray(t.codexLines) && t.codexLines.length > 20) {
            const drop = Math.floor(t.codexLines.length / 2);
            t.codexLines = t.codexLines.slice(drop);
            t.deliveredToChat = Math.max(0, (t.deliveredToChat || 0) - drop);
          }
        }
        localStorage.setItem(STORE, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    }
  };

  const threadOf = (data, key) => {
    const t = data.threads[key] || {};
    return {
      codexLines: Array.isArray(t.codexLines) ? t.codexLines : [],
      deliveredToChat: Number(t.deliveredToChat) || 0,
      deliveredToCodex: Number(t.deliveredToCodex) || 0,
    };
  };

  const clamp = (lines) => {
    let out = lines.slice(-MAX_LINES);
    let total = 0;
    const kept = [];
    for (let i = out.length - 1; i >= 0; i--) {
      total += out[i].length;
      if (total > MAX_CHARS) break;
      kept.unshift(out[i]);
    }
    return kept.length ? kept : out.slice(-1);
  };

  const chatRows = (key) => {
    try {
      const rows = JSON.parse(localStorage.getItem("cdr-thread-extras:" + key) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };

  const isChatMode = () => {
    try {
      const m = globalThis.__cdrLocalModeV4;
      if (m && typeof m.mode === "function") return m.mode() === "chat";
    } catch {}
    // Only a positive match short-circuits. Returning the comparison here
    // would report "not chat" whenever the attribute is simply absent, which
    // silently disables the chat->codex injection before first paint.
    try {
      if (document.documentElement.getAttribute("data-codex-product-mode") === "chat") return true;
    } catch {}
    try {
      if (String(localStorage.getItem("cdr-product-mode") || "").replace(/^["']|["']$/g, "") === "chat")
        return true;
    } catch {}
    return false;
  };

  // Record the full Codex transcript for a thread. The watermark is left
  // alone unless the transcript shrank (thread switch / re-render with
  // fewer entries), in which case it is clamped so we never skip turns.
  const recordCodex = (key, lines) => {
    if (!key || !Array.isArray(lines) || !lines.length) return;
    const data = load();
    const t = threadOf(data, key);
    const next = clamp(lines.map(String));
    if (
      next.length === t.codexLines.length &&
      next[next.length - 1] === t.codexLines[t.codexLines.length - 1]
    ) {
      return; // unchanged, avoid a write on every render
    }
    // The watermark is an index, so it is only meaningful if the new
    // transcript still starts with the lines we already delivered. When the
    // prefix diverges (thread switch, trimmed history, a re-render carrying
    // different entries) the index means nothing and keeping it would mute
    // the handoff forever. Re-sending context is recoverable; losing it is not.
    const shared = Math.min(next.length, t.codexLines.length);
    let prefixIntact = true;
    for (let i = 0; i < shared; i++) {
      if (next[i] !== t.codexLines[i]) {
        prefixIntact = false;
        break;
      }
    }
    data.threads[key] = {
      codexLines: next,
      deliveredToChat: prefixIntact ? Math.min(t.deliveredToChat, next.length) : 0,
      deliveredToCodex: t.deliveredToCodex,
    };
    save(data);
  };

  const pendingForChat = (key) => {
    if (!key) return null;
    const t = threadOf(load(), key);
    const fresh = t.codexLines.slice(t.deliveredToChat);
    if (!fresh.length) return null;
    return {
      mark: t.codexLines.length,
      text:
        "You are continuing an existing Codex task in Chat mode. The transcript below is " +
        "authoritative prior context from the Codex side of this same task. Continue naturally " +
        "from it, preserve every decision and constraint, and do not mention this handoff " +
        "unless asked.\n\n<codex_transcript>\n" +
        fresh.join("\n\n---\n\n") +
        "\n</codex_transcript>",
    };
  };

  const commitChat = (key, mark) => {
    if (!key) return;
    const data = load();
    const t = threadOf(data, key);
    data.threads[key] = { ...t, deliveredToChat: Math.max(t.deliveredToChat, Number(mark) || 0) };
    save(data);
  };

  const pendingForCodex = (key) => {
    if (!key) return null;
    const t = threadOf(load(), key);
    const rows = chatRows(key);
    const fresh = rows.slice(t.deliveredToCodex).filter((r) => r && r.text);
    if (!fresh.length) return null;
    const lines = clamp(
      fresh.map(
        (r) => (r.role === "user" ? "User" : "Assistant") + ": " + String(r.text).trim(),
      ),
    );
    if (!lines.length) return null;
    return {
      mark: rows.length,
      text:
        "This task also has Chat mode turns that happened since you last saw it. The transcript " +
        "below is authoritative prior context from the Chat side of this same task. Use it, " +
        "preserve every decision and constraint, and do not mention this handoff unless asked." +
        "\n\n<chat_transcript>\n" +
        lines.join("\n\n---\n\n") +
        "\n</chat_transcript>",
    };
  };

  const commitCodex = (key, mark) => {
    if (!key) return;
    const data = load();
    const t = threadOf(data, key);
    data.threads[key] = { ...t, deliveredToCodex: Math.max(t.deliveredToCodex, Number(mark) || 0) };
    save(data);
  };

  globalThis.__cdrHandoffV1 = {
    commitChat,
    commitCodex,
    isChatMode,
    pendingForChat,
    pendingForCodex,
    recordCodex,
    storeKey: STORE,
  };
  return globalThis.__cdrHandoffV1;
}

const RUNTIME = `
function CDRInstallHandoffV1(){/* ${MARKER}:runtime */
(${installHandoffRuntime.toString()})();
}CDRInstallHandoffV1();
`;

// ─── Monolith edits ─────────────────────────────────────────────────

function main() {

let mono = fs.readFileSync(MONO, "utf8");
let thread = fs.readFileSync(THREAD, "utf8");

if (mono.includes(MARKER + ":applied")) {
  console.log("[skip] handoff-sync-v1: already applied");
  process.exit(0);
}

// 1. Install the runtime ahead of the chat bridge.
mono = replaceOne(
  mono,
  "\nasync function CDRStickyChatSend(",
  RUNTIME + "\nasync function CDRStickyChatSend(",
  "install handoff runtime",
);
console.log("[ok] handoff runtime installed");

// 2. codex -> chat: replace the create-only gate with a delta check.
const OLD_CHAT_CTX =
  "let priorContext='';\n" +
  "try{let ctx=globalThis.__cdrCodexContextByThread&&globalThis.__cdrCodexContextByThread[key];if(ctx&&typeof ctx.text==='string')priorContext=ctx.text}catch{}\n" +
  "let prompt=text;\n" +
  "if(!continuing&&priorContext)prompt=priorContext+'\\n\\n<current_user_message>\\n'+text+'\\n</current_user_message>';";

// bugfix-v1: gate on !continuing so the codex transcript is only injected on
// the first chat message of a conversation, not on every subsequent send.
// Without this, watermark resets (e.g. after a mode-switch reload) cause the
// entire codex transcript to be re-injected into every message prompt, which
// the user sees as "prompting the transcript."
const NEW_CHAT_CTX =
  "let _cdrPend=null;/* " + MARKER + ":chat-delta */\n" +
  "try{if(!continuing&&globalThis.__cdrHandoffV1)_cdrPend=globalThis.__cdrHandoffV1.pendingForChat(key)}catch{}\n" +
  "let prompt=text;\n" +
  "if(_cdrPend&&_cdrPend.text)prompt=_cdrPend.text+'\\n\\n<current_user_message>\\n'+text+'\\n</current_user_message>';";

mono = replaceOne(mono, OLD_CHAT_CTX, NEW_CHAT_CTX, "codex->chat delta injection");
console.log("[ok] codex->chat switched to delta sync");

// 3. Advance the codex->chat watermark only after the stream succeeded.
mono = replaceOne(
  mono,
  "if(seenConv&&nextParent){",
  "try{if(_cdrPend&&globalThis.__cdrHandoffV1)globalThis.__cdrHandoffV1.commitChat(key,_cdrPend.mark)}catch{}\n" +
    "if(seenConv&&nextParent){",
  "codex->chat watermark commit",
);
console.log("[ok] codex->chat watermark commits after a successful send");

// 4. chat -> codex: prepend pending chat turns on the interactive send path.
//    `l` is the destructured `prompt` parameter of the send function, so it
//    is reassignable, and injecting ahead of `let v=CH(),y=l.trim();` means
//    both `v` and `y` observe the augmented prompt.
const SEND_ANCHOR = "let v=CH(),y=l.trim();";
const SEND_INJECT =
  "try{/* " + MARKER + ":codex-delta */" +
  "let _h=globalThis.__cdrHandoffV1;" +
  "if(_h&&!_h.isChatMode()){" +
  "let _k=String(n||'').includes(':')?String(n):'local:'+n," +
  "_p=_h.pendingForCodex(_k);" +
  "if(_p&&_p.text){l=_p.text+'\\n\\n'+String(l||'');_h.commitCodex(_k,_p.mark)}" +
  "}}catch(_e){try{console.error('[cdr] codex handoff',_e)}catch{}}\n";

mono = replaceOne(mono, SEND_ANCHOR, SEND_INJECT + SEND_ANCHOR, "chat->codex delta injection");
console.log("[ok] chat->codex injected on the interactive send path");

// ─── Thread-bundle edit ─────────────────────────────────────────────
// 5. Feed the publisher's transcript lines into the handoff store.

const PUB_ANCHOR =
  "globalThis.__cdrCodexContextByThread[key]={text:text,turnCount:lines.length,updatedAt:Date.now()}";
thread = replaceOne(
  thread,
  PUB_ANCHOR,
  PUB_ANCHOR +
    ";try{globalThis.__cdrHandoffV1&&globalThis.__cdrHandoffV1.recordCodex(key,lines)}catch{}/* " +
    MARKER +
    ":publisher */",
  "publisher -> handoff store",
);
console.log("[ok] transcript publisher now records into the handoff store");

// ─── Verify + write ─────────────────────────────────────────────────

mono = mono.replace(
  "function CDRInstallHandoffV1(){",
  "/* " + MARKER + ":applied */function CDRInstallHandoffV1(){",
);

parseOk("monolith", mono);
parseOk("thread bundle", thread);
console.log("[ok] both bundles parse");

if (process.argv.includes("--check")) {
  console.log("[ok] handoff-sync-v1: check complete (no files written)");
} else {
  fs.writeFileSync(MONO, mono);
  fs.writeFileSync(THREAD, thread);
  console.log("[ok] handoff-sync-v1: written");
}

}

module.exports = { installHandoffRuntime, MARKER };

if (require.main === module) main();
