#!/usr/bin/env node
"use strict";

/**
 * Live round-trip test for the Codex <-> Chat handoff, run against the built
 * app rather than the source tree, so it proves the runtime survived ASAR
 * packing and actually executes in the shipped bundle.
 *
 * Drives __cdrHandoffV1 directly in the renderer: the UI path needs a signed-in
 * account and real model spend, but the store, the watermarks, and the
 * persistence are exactly what the injected call sites use.
 */

const { spawn, execSync } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const APP = path.join(
  __dirname,
  "..",
  "out",
  "mac-x64",
  "Codex.app",
  "Contents",
  "MacOS",
  "ChatGPT",
);
const PORT = 9347;
const OUT = path.join(__dirname, "..", "out", "live-test-handoff.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(JSON.parse(d)));
      })
      .on("error", reject);
  });
}

function cdp(wsUrl) {
  let id = 1;
  const pending = new Map();
  const ws = new WebSocket(wsUrl);
  const ready = new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", (e) => rej(e.error || e));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  return {
    ready,
    send: async (method, params = {}) => {
      await ready;
      const i = id++;
      return new Promise((resolve, reject) => {
        pending.set(i, { resolve, reject });
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

// Runs inside the renderer. Returns a list of {name, ok, detail}.
const SCENARIO = `(() => {
  const results = [];
  const check = (name, fn) => {
    try { const detail = fn(); results.push({ name, ok: true, detail: detail ?? null }); }
    catch (e) { results.push({ name, ok: false, detail: String(e && e.message || e) }); }
  };

  const KEY = 'local:__cdr_live_test__';
  const EXTRAS = 'cdr-thread-extras:' + KEY;
  try { localStorage.removeItem(EXTRAS); } catch {}
  try {
    const raw = JSON.parse(localStorage.getItem('cdr-handoff-v1') || 'null');
    if (raw && raw.threads) { delete raw.threads[KEY]; localStorage.setItem('cdr-handoff-v1', JSON.stringify(raw)); }
  } catch {}

  check('handoff runtime is installed in the shipped bundle', () => {
    const h = globalThis.__cdrHandoffV1;
    if (!h) throw new Error('__cdrHandoffV1 is undefined');
    for (const m of ['recordCodex','pendingForChat','commitChat','pendingForCodex','commitCodex','isChatMode']) {
      if (typeof h[m] !== 'function') throw new Error('missing method: ' + m);
    }
    return Object.keys(h).sort().join(',');
  });

  const h = globalThis.__cdrHandoffV1;

  check('codex -> chat: first send carries the codex transcript', () => {
    h.recordCodex(KEY, ['User: design the cache', 'Assistant: use an LRU']);
    const p = h.pendingForChat(KEY);
    if (!p) throw new Error('no pending handoff');
    if (!p.text.includes('design the cache')) throw new Error('transcript missing');
    if (!p.text.includes('<codex_transcript>')) throw new Error('wrapper missing');
    h.commitChat(KEY, p.mark);
    return 'mark=' + p.mark;
  });

  check('codex -> chat: committed turns are not resent', () => {
    if (h.pendingForChat(KEY) !== null) throw new Error('resent already-delivered turns');
    return 'clean';
  });

  check('codex -> chat: LATER codex work still reaches an open chat', () => {
    h.recordCodex(KEY, ['User: design the cache', 'Assistant: use an LRU', 'User: make it thread safe', 'Assistant: added a mutex']);
    const p = h.pendingForChat(KEY);
    if (!p) throw new Error('later codex work did not reach chat (the original bug)');
    if (!p.text.includes('thread safe')) throw new Error('new turns missing');
    if (p.text.includes('design the cache')) throw new Error('resent old turns instead of the delta');
    h.commitChat(KEY, p.mark);
    return 'delta only';
  });

  check('chat -> codex: chat turns reach codex after a mode switch', () => {
    localStorage.setItem(EXTRAS, JSON.stringify([
      { role: 'user', text: 'what timeout should we use?' },
      { role: 'assistant', text: 'thirty seconds' },
    ]));
    const p = h.pendingForCodex(KEY);
    if (!p) throw new Error('chat turns never reached codex (the original bug)');
    if (!p.text.includes('thirty seconds')) throw new Error('chat transcript missing');
    if (!p.text.includes('<chat_transcript>')) throw new Error('wrapper missing');
    h.commitCodex(KEY, p.mark);
    return 'mark=' + p.mark;
  });

  check('chat -> codex: only new chat turns are resent', () => {
    if (h.pendingForCodex(KEY) !== null) throw new Error('resent delivered chat turns');
    const rows = JSON.parse(localStorage.getItem(EXTRAS));
    rows.push({ role: 'user', text: 'and the retry budget?' });
    localStorage.setItem(EXTRAS, JSON.stringify(rows));
    const p = h.pendingForCodex(KEY);
    if (!p) throw new Error('new chat turn not detected');
    if (!p.text.includes('retry budget')) throw new Error('new turn missing');
    if (p.text.includes('thirty seconds')) throw new Error('resent old turns instead of the delta');
    return 'delta only';
  });

  check('watermarks are persisted to localStorage', () => {
    const raw = JSON.parse(localStorage.getItem('cdr-handoff-v1') || 'null');
    if (!raw || !raw.threads || !raw.threads[KEY]) throw new Error('nothing persisted');
    const t = raw.threads[KEY];
    if (!(t.deliveredToChat > 0)) throw new Error('chat watermark not persisted');
    if (!(t.deliveredToCodex > 0)) throw new Error('codex watermark not persisted');
    return 'toChat=' + t.deliveredToChat + ' toCodex=' + t.deliveredToCodex;
  });

  // The injected call sites are module-scoped, so they cannot be read from
  // the page global. Their gate, isChatMode(), is reachable, and it is what
  // decides which direction runs on a send — so exercise that instead.
  check('isChatMode gates the two directions correctly', () => {
    const prior = localStorage.getItem('cdr-product-mode');
    try {
      const mode = globalThis.__cdrLocalModeV4;
      if (mode && typeof mode.setMode === 'function') {
        mode.setMode('chat');
        if (h.isChatMode() !== true) throw new Error('chat mode not detected via the mode runtime');
        mode.setMode('codex');
        if (h.isChatMode() !== false) throw new Error('codex mode misreported as chat');
        return 'via __cdrLocalModeV4';
      }
      localStorage.setItem('cdr-product-mode', 'chat');
      if (h.isChatMode() !== true) throw new Error('chat mode not detected via storage');
      localStorage.setItem('cdr-product-mode', 'codex');
      if (h.isChatMode() !== false) throw new Error('codex mode misreported as chat');
      return 'via localStorage';
    } finally {
      if (prior == null) localStorage.removeItem('cdr-product-mode');
      else localStorage.setItem('cdr-product-mode', prior);
    }
  });

  // Leave no test data behind.
  try { localStorage.removeItem(EXTRAS); } catch {}
  try {
    const raw = JSON.parse(localStorage.getItem('cdr-handoff-v1') || 'null');
    if (raw && raw.threads) { delete raw.threads[KEY]; localStorage.setItem('cdr-handoff-v1', JSON.stringify(raw)); }
  } catch {}

  return results;
})()`;

async function main() {
  if (!fs.existsSync(APP)) throw new Error(`built app not found at ${APP}`);
  try {
    execSync("pkill -f 'out/mac-x64/Codex.app' || true", { stdio: "ignore" });
  } catch {}
  await sleep(800);

  console.log("[i] launching built app with debug port", PORT);
  const child = spawn(APP, [`--remote-debugging-port=${PORT}`], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  let targets;
  for (let i = 0; i < 120; i++) {
    try {
      targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
      if (targets?.length) break;
    } catch {}
    await sleep(400);
  }
  if (!targets?.length) throw new Error("app never exposed a CDP target");

  const page = targets.find((t) => (t.url || "").includes("app://")) || targets[0];
  console.log("[i] target:", page.url);
  const s = cdp(page.webSocketDebuggerUrl);
  await s.ready;
  await s.send("Runtime.enable");

  // Wait for the bundle to evaluate and install the runtime.
  let installed = false;
  for (let i = 0; i < 60; i++) {
    const r = await s.send("Runtime.evaluate", {
      expression: "typeof globalThis.__cdrHandoffV1",
      returnByValue: true,
    });
    if (r.result?.value === "object") {
      installed = true;
      break;
    }
    await sleep(1000);
  }
  console.log("[i] handoff runtime present:", installed);

  const res = await s.send("Runtime.evaluate", {
    expression: SCENARIO,
    returnByValue: true,
    awaitPromise: false,
  });

  const results = res.result?.value;
  if (!Array.isArray(results)) {
    console.error("[x] scenario did not return results:", JSON.stringify(res).slice(0, 800));
    process.exitCode = 1;
  } else {
    console.log("");
    let failed = 0;
    for (const r of results) {
      if (!r.ok) failed++;
      console.log(`  [${r.ok ? "ok" : "FAIL"}]  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
    }
    console.log(`\n== ${results.length - failed}/${results.length} live checks passed ==`);
    process.exitCode = failed ? 1 : 0;
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  }

  s.close();
  try {
    execSync("pkill -f 'out/mac-x64/Codex.app' || true", { stdio: "ignore" });
  } catch {}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
