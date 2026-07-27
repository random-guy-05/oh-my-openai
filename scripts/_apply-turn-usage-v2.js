#!/usr/bin/env node
"use strict";

/**
 * Genuine per-turn usage (v3), replacing the fabricated badge.
 * Hover tip also surfaces task cumulative % and /limits caps.
 *
 * WHAT WAS WRONG
 * --------------
 * CDRTurnUsageBadge accepted a turnId and never used it to look anything up.
 * It read `__cdrUsageV1.summary(threadId).usage.last` — a single thread-level
 * "most recent turn" counter — on a 300 ms timer after mount. Opening a thread
 * with twenty turns made all twenty badges read the same value and render
 * identical token counts for twenty different turns, under a tooltip reading
 * "Tokens for this turn only". CDRTaskUsageBadge had the mirror problem: it
 * renders cumulative task usage, but sat in the per-turn action row, so the
 * same percentages repeated on every turn.
 *
 * WHAT THIS DOES
 * --------------
 * `usage.last` is real per-turn data, but it is only attributable at the
 * moment a turn completes. This installs a reconciler driven by two events
 * that already exist in the bundle:
 *
 *   cdr-publish-transcript  carries the thread key and every rendered entry,
 *                           each with its turnId, in order
 *   cdr-usage-change        fires when AppServer token telemetry updates
 *
 * On the first sighting of a turnId the reconciler snapshots that thread's
 * current quota deltas as the turn's starting point. When `usage.last` then
 * changes, it binds that reading to the newest still-pending turn and records
 * the quota consumed between its start and now. Bindings are persisted, so a
 * turn keeps its own numbers across reloads.
 *
 * A turn with no binding renders nothing. Turns that predate this feature
 * therefore stay blank rather than displaying an invented number.
 */

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:turn-usage-v3";
const OLD_MARKERS = [
  "codex-rebuild:turn-usage-v2:applied",
  "codex-rebuild:turn-usage-v2:badge",
  "codex-rebuild:turn-usage-v2:runtime",
];

const monoName = fs
  .readdirSync(ASSETS)
  .find((f) => f.startsWith("app-initial-") && f.endsWith(".js"));
if (!monoName) throw new Error("app-initial bundle not found");
const MONO = path.join(ASSETS, monoName);

// ─── Reconciler runtime ─────────────────────────────────────────────

function installTurnUsageRuntime() {
  if (globalThis.__cdrTurnUsageV1) return globalThis.__cdrTurnUsageV1;

  const STORE = "cdr-turn-usage-v1";
  const MAX_TURNS = 300;

  const norm = (k) => String(k || "").replace(/^local:/, "");

  const load = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "null");
      if (raw && typeof raw === "object" && raw.turns && raw.threads) return raw;
    } catch {}
    return { turns: {}, threads: {}, order: [] };
  };

  const save = (data) => {
    try {
      if (data.order.length > MAX_TURNS) {
        const drop = data.order.splice(0, data.order.length - MAX_TURNS);
        for (const id of drop) delete data.turns[id];
      }
      localStorage.setItem(STORE, JSON.stringify(data));
    } catch {}
  };

  const emit = () => {
    try {
      window.dispatchEvent(new CustomEvent("cdr-turn-usage-change"));
    } catch {}
  };

  // The usage runtime keys threads by whatever the status component passes,
  // while the transcript publisher prefixes "local:". Try both spellings.
  const summaryFor = (key) => {
    const u = globalThis.__cdrUsageV1;
    if (!u || typeof u.summary !== "function") return null;
    for (const candidate of [key, "local:" + norm(key), norm(key)]) {
      try {
        const s = u.summary(candidate);
        if (s) return s;
      } catch {}
    }
    return null;
  };

  const sigOf = (last) =>
    last
      ? [
          last.inputTokens || 0,
          last.cachedInputTokens || 0,
          last.outputTokens || 0,
          last.reasoningOutputTokens || 0,
          last.totalTokens || 0,
        ].join("/")
      : "";

  /**
   * Register turns and attribute completed usage.
   * @param {string} key thread key in either spelling
   * @param {string[]} turnIds rendered turn ids, in transcript order
   */
  const reconcile = (key, turnIds) => {
    const threadKey = norm(key);
    if (!threadKey) return;
    const summary = summaryFor(key);
    if (!summary) return;

    const data = load();
    const thread = data.threads[threadKey] || { pending: [], lastSig: "" };
    thread.pending = Array.isArray(thread.pending) ? thread.pending : [];
    let changed = false;

    const fiveNow = summary.fiveHourDelta;
    const weekNow = summary.weeklyDelta;

    // 1. Register any turn we have not seen, snapshotting its starting quota.
    for (const turnId of Array.isArray(turnIds) ? turnIds : []) {
      if (!turnId || data.turns[turnId]) continue;
      data.turns[turnId] = {
        threadKey,
        pending: true,
        startFiveHour: fiveNow,
        startWeekly: weekNow,
        at: Date.now(),
      };
      data.order.push(turnId);
      thread.pending.push(turnId);
      changed = true;
    }

    // 2. Attribute a fresh usage.last reading to the newest pending turn.
    const last = summary.usage && summary.usage.last;
    const sig = sigOf(last);
    if (sig && sig !== thread.lastSig && last && last.totalTokens > 0) {
      thread.lastSig = sig;
      const turnId = thread.pending[thread.pending.length - 1];
      if (turnId && data.turns[turnId] && data.turns[turnId].pending) {
        const rec = data.turns[turnId];
        const span = (now, start) =>
          now == null || start == null ? null : Math.max(0, now - start);
        data.turns[turnId] = {
          threadKey,
          pending: false,
          inputTokens: last.inputTokens || 0,
          cachedInputTokens: last.cachedInputTokens || 0,
          outputTokens: last.outputTokens || 0,
          reasoningOutputTokens: last.reasoningOutputTokens || 0,
          totalTokens: last.totalTokens || 0,
          fiveHourDelta: span(fiveNow, rec.startFiveHour),
          weeklyDelta: span(weekNow, rec.startWeekly),
          at: Date.now(),
        };
        thread.pending = thread.pending.filter((id) => id !== turnId);
        changed = true;
      }
    }

    if (changed) {
      data.threads[threadKey] = thread;
      save(data);
      emit();
    }
  };

  const get = (turnId) => {
    if (!turnId) return null;
    const rec = load().turns[String(turnId)];
    return rec && rec.pending === false ? rec : null;
  };

  const reset = () => {
    try {
      localStorage.removeItem(STORE);
    } catch {}
    emit();
  };

  try {
    window.addEventListener("cdr-publish-transcript", (ev) => {
      try {
        const d = ev && ev.detail;
        if (!d || !d.key) return;
        const ids = (Array.isArray(d.entries) ? d.entries : [])
          .map((e) => e && (e.turnId || (e.turn && e.turn.turnId)))
          .filter(Boolean);
        reconcile(d.key, ids);
      } catch {}
    });
  } catch {}

  try {
    window.addEventListener("cdr-usage-change", (ev) => {
      try {
        const d = ev && ev.detail;
        reconcile(d && d.threadKey, []);
      } catch {}
    });
  } catch {}

  globalThis.__cdrTurnUsageV1 = { get, reconcile, reset, storeKey: STORE };
  return globalThis.__cdrTurnUsageV1;
}

// ─── Source surgery helpers ─────────────────────────────────────────

function functionExtent(src, name) {
  const head = `function ${name}(`;
  const start = src.indexOf(head);
  if (start === -1) throw new Error(`${name} not found`);
  if (src.indexOf(head, start + 1) !== -1) throw new Error(`${name} is not unique`);
  // Walk the parameter list first. These components take a destructured
  // object, so the first `{` after the name belongs to the params, not the
  // body, and brace-matching from there would close almost immediately.
  let p = start + head.length - 1;
  let parens = 0;
  for (; p < src.length; p++) {
    if (src[p] === "(") parens++;
    else if (src[p] === ")") {
      parens--;
      if (parens === 0) break;
    }
  }
  let i = src.indexOf("{", p);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`${name}: unbalanced braces`);
}

function detectAliases(body) {
  const react = body.match(/\(0,([A-Za-z_$][\w$]*)\.useState\)/);
  const jsx = body.match(/\(0,([A-Za-z_$][\w$]*)\.jsx\)/);
  if (!react) throw new Error("could not detect the React hooks alias");
  if (!jsx) throw new Error("could not detect the JSX alias");
  return { react: react[1], jsx: jsx[1] };
}

function buildBadge(REACT, JSX) {
  return (
    `function CDRTurnUsageBadge({threadId,turnId}){/* ${MARKER}:badge */\n` +
    `let [,setTick]=(0,${REACT}.useState)(0);\n` +
    `(0,${REACT}.useEffect)(()=>{let f=()=>setTick(v=>v+1);` +
    `try{window.addEventListener('cdr-turn-usage-change',f)}catch{}` +
    `try{window.addEventListener('cdr-usage-change',f)}catch{}` +
    `return()=>{try{window.removeEventListener('cdr-turn-usage-change',f)}catch{}` +
    `try{window.removeEventListener('cdr-usage-change',f)}catch{}}},[]);\n` +
    `let rec=null;try{rec=globalThis.__cdrTurnUsageV1?globalThis.__cdrTurnUsageV1.get(turnId):null}catch{}\n` +
    `if(!rec||!(rec.totalTokens>0))return null;\n` +
    `let fmt=n=>Number(n||0).toLocaleString(),pct=n=>n==null?null:'+'+n.toFixed(1)+'%';\n` +
    `let parts=[];\n` +
    `if(rec.inputTokens>0)parts.push('in '+fmt(rec.inputTokens));\n` +
    `if(rec.cachedInputTokens>0)parts.push('cached '+fmt(rec.cachedInputTokens));\n` +
    `if(rec.outputTokens>0)parts.push('out '+fmt(rec.outputTokens));\n` +
    `if(rec.reasoningOutputTokens>0)parts.push('reason '+fmt(rec.reasoningOutputTokens));\n` +
    `parts.push('= '+fmt(rec.totalTokens));\n` +
    `let q=[],f5=pct(rec.fiveHourDelta),f7=pct(rec.weeklyDelta);\n` +
    `if(f5)q.push('5h '+f5);if(f7)q.push('7d '+f7);\n` +
    `let text=parts.join(' · ')+(q.length?'  ·  '+q.join(' · '):'');\n` +
    `let tip='Tokens for this turn (bound when it completed).';\n` +
    `if(q.length)tip+=' Quota deltas are account-usage measured across this turn.';\n` +
    `try{let s=globalThis.__cdrUsageV1&&globalThis.__cdrUsageV1.summary?globalThis.__cdrUsageV1.summary(threadId):null;\n` +
    `if(s){let cfg=s.config||{},lim=[];\n` +
    `if(cfg.fiveHourPercent!=null)lim.push('5h cap '+cfg.fiveHourPercent+'%');\n` +
    `if(cfg.weeklyPercent!=null)lim.push('7d cap '+cfg.weeklyPercent+'%');\n` +
    `if(cfg.maxTokens!=null)lim.push('token cap '+fmt(cfg.maxTokens));\n` +
    `let task=[];\n` +
    `if(s.fiveHourDelta!=null)task.push('5h +'+s.fiveHourDelta.toFixed(1)+'%');\n` +
    `if(s.weeklyDelta!=null)task.push('7d +'+s.weeklyDelta.toFixed(1)+'%');\n` +
    `if(s.hasExactUsage&&s.usage&&s.usage.total&&s.usage.total.totalTokens!=null)task.push(fmt(s.usage.total.totalTokens)+' tokens');\n` +
    `if(task.length)tip+=' Task so far: '+task.join(' · ')+'.';\n` +
    `if(lim.length)tip+=' Limits: '+lim.join(' · ')+' (set via /limits).';\n` +
    `else tip+=' No task caps set — use /limits.';}}\n` +
    `catch{}\n` +
    `return(0,${JSX}.jsx)('span',{className:'ml-1.5 select-none whitespace-nowrap text-xs tabular-nums text-token-text-tertiary',` +
    `title:tip,'aria-label':'Turn usage: '+text,children:text})}`
  );
}

function main() {
  let mono = fs.readFileSync(MONO, "utf8");

  if (mono.includes(MARKER + ":applied")) {
    console.log("[skip] turn-usage-v3: already applied");
    return;
  }

  const upgrading = OLD_MARKERS.some((m) => mono.includes(m));
  if (upgrading) console.log("[upgrade] turn-usage-v2 → v3 (task limits in tooltip)");

  const turnExtent = functionExtent(mono, "CDRTurnUsageBadge");
  const turnBody = mono.slice(turnExtent.start, turnExtent.end);
  const { react: REACT, jsx: JSX } = detectAliases(turnBody);
  console.log(`[detect] React=${REACT} JSX=${JSX}`);

  const NEW_BADGE = buildBadge(REACT, JSX);
  mono = mono.slice(0, turnExtent.start) + NEW_BADGE + mono.slice(turnExtent.end);
  console.log("[ok] CDRTurnUsageBadge replaced with per-turn reading + task-limit tip");

  // Drop the cumulative task badge from the per-turn action row when still present.
  const rowRe = new RegExp(
    `\\(0,${JSX}\\.jsx\\)\\(CDRTaskUsageBadge,\\{threadId:\\w+\\}\\),`,
    "g",
  );
  const rowHits = mono.match(rowRe);
  if (rowHits && rowHits.length === 1) {
    mono = mono.replace(rowRe, "");
    console.log("[ok] cumulative task badge removed from the per-turn action row");
  } else if (!upgrading) {
    throw new Error(`expected 1 CDRTaskUsageBadge placement, found ${rowHits ? rowHits.length : 0}`);
  } else {
    console.log("[ok] cumulative task badge already absent (prior v2)");
  }

  if (mono.includes("function CDRTaskUsageBadge(")) {
    const taskExtent = functionExtent(mono, "CDRTaskUsageBadge");
    mono = mono.slice(0, taskExtent.start) + mono.slice(taskExtent.end);
    console.log("[ok] CDRTaskUsageBadge declaration removed");
  }

  // Fresh install of the reconciler, or leave the existing one when upgrading.
  if (!mono.includes("function CDRInstallTurnUsageV1(")) {
    const RUNTIME =
      `/* ${MARKER}:applied */\nfunction CDRInstallTurnUsageV1(){/* ${MARKER}:runtime */\n` +
      `(${installTurnUsageRuntime.toString()})();\n}CDRInstallTurnUsageV1();\n`;
    mono = mono.replace("function CDRTurnUsageBadge(", RUNTIME + "function CDRTurnUsageBadge(");
    console.log("[ok] turn-usage reconciler installed");
  } else {
    for (const old of OLD_MARKERS) mono = mono.split(old).join(MARKER + old.slice("codex-rebuild:turn-usage-v2".length));
    if (!mono.includes(MARKER + ":applied")) {
      mono = mono.replace(
        "function CDRInstallTurnUsageV1(",
        `/* ${MARKER}:applied */function CDRInstallTurnUsageV1(`,
      );
    }
    console.log("[ok] turn-usage reconciler retained; markers bumped to v3");
  }

  try {
    acorn.parse(mono, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error(`monolith no longer parses: ${e.message}`);
  }
  console.log("[ok] monolith parses");

  if (process.argv.includes("--check")) {
    console.log("[ok] turn-usage-v3: check complete (no files written)");
  } else {
    fs.writeFileSync(MONO, mono);
    console.log("[ok] turn-usage-v3: written");
  }
}

module.exports = { installTurnUsageRuntime, MARKER };

if (require.main === module) main();
