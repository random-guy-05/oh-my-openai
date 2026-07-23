#!/usr/bin/env node
"use strict";
/**
 * CDP capture without ws module — uses Node undici/websocket if available,
 * else falls back to python3 helper.
 */
const { spawn, execSync } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");

const APP = (() => {
  const candidates = [
    path.join(
      os.homedir(),
      "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
    ),
    "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/MacOS/ChatGPT",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("Codex binary not found: " + candidates.join(" | "));
})();
const PORT = 9333;
const OUT = path.join(__dirname, "..", "out", "debug-cdp-errors.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function captureWithNodeWS(wsUrl, durationMs) {
  // Node 22+ global WebSocket
  if (typeof WebSocket === "undefined") throw new Error("no WebSocket");
  const errors = [];
  const logs = [];
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      resolve();
    }, durationMs);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
      ws.send(JSON.stringify({ id: 2, method: "Log.enable" }));
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params?.exceptionDetails || {};
        errors.push({
          text: d.text,
          exception: d.exception?.description || d.exception?.value,
          url: d.url,
          line: d.lineNumber,
        });
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const args = (msg.params?.args || [])
          .map((a) => a.value ?? a.description ?? "")
          .join(" ");
        if (/error|exception|turn|oops|fail|TypeError/i.test(args)) {
          logs.push({ type: msg.params?.type, args: String(args).slice(0, 800) });
        }
      }
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(timer);
      reject(e.error || e);
    });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return { errors, logs };
}

async function main() {
  try {
    execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true", {
      stdio: "ignore",
    });
  } catch {}
  await sleep(1200);

  const errLog = path.join(__dirname, "..", "out", "codex-stderr.log");
  const errFd = fs.openSync(errLog, "w");
  const child = spawn(
    APP,
    [`--remote-debugging-port=${PORT}`, "--enable-logging"],
    {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
      stdio: ["ignore", "ignore", errFd],
      detached: true,
    },
  );
  child.unref();
  fs.closeSync(errFd);

  let targets = null;
  for (let i = 0; i < 50; i++) {
    try {
      targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(targets) && targets.length) break;
    } catch {}
    await sleep(400);
  }
  if (!targets?.length) {
    // try /json
    try {
      targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
    } catch {}
  }
  console.log("targets", targets?.length, targets?.map((t) => t.type + ":" + (t.url || t.title || "").slice(0, 80)));

  const all = { errors: [], logs: [], targets };
  for (const t of (targets || []).slice(0, 8)) {
    if (!t.webSocketDebuggerUrl) continue;
    console.log("attach", (t.url || t.title || "").slice(0, 100));
    try {
      const r = await captureWithNodeWS(t.webSocketDebuggerUrl, 12000);
      all.errors.push(...r.errors.map((e) => ({ ...e, target: t.url })));
      all.logs.push(...r.logs.map((e) => ({ ...e, target: t.url })));
    } catch (e) {
      all.errors.push({ attachError: String(e), target: t.url });
    }
  }

  // Also evaluate localStorage mode + try to click via Runtime.evaluate navigate
  for (const t of (targets || []).slice(0, 4)) {
    if (!t.webSocketDebuggerUrl || typeof WebSocket === "undefined") continue;
    try {
      await new Promise((resolve) => {
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        const timer = setTimeout(() => {
          try {
            ws.close();
          } catch {}
          resolve();
        }, 3000);
        ws.addEventListener("open", () => {
          ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
          ws.send(
            JSON.stringify({
              id: 2,
              method: "Runtime.evaluate",
              params: {
                expression: `(() => {
                  try {
                    const mode = localStorage.getItem('cdr-product-mode');
                    const keys = Object.keys(localStorage).filter(k => k.startsWith('cdr-'));
                    const extras = keys.filter(k => k.startsWith('cdr-thread-extras')).map(k => ({k, n: (JSON.parse(localStorage.getItem(k)||'[]')||[]).length}));
                    // Find thread links
                    const links = [...document.querySelectorAll('a[href*=\"/local/\"]')].slice(0,8).map(a => a.getAttribute('href'));
                    return JSON.stringify({mode, keys, extras, links, href: location.href, title: document.title, body: (document.body&&document.body.innerText||'').slice(0,500)});
                  } catch (e) { return JSON.stringify({evalError: String(e)}); }
                })()`,
                returnByValue: true,
              },
            }),
          );
        });
        ws.addEventListener("message", (ev) => {
          const msg = JSON.parse(String(ev.data));
          if (msg.id === 2) {
            all.pageState = msg.result?.result?.value;
            clearTimeout(timer);
            try {
              ws.close();
            } catch {}
            resolve();
          }
        });
        ws.addEventListener("error", () => resolve());
      });
    } catch {}
  }

  // If we found a /local/ link, navigate to it and recapture errors
  let links = [];
  try {
    const st = JSON.parse(all.pageState || "{}");
    links = st.links || [];
    console.log("pageState", all.pageState);
  } catch {}

  if (links[0] && targets?.[0]?.webSocketDebuggerUrl) {
    const t = targets.find((x) => x.url && x.url.includes("app://")) || targets[0];
    console.log("navigating to", links[0]);
    await new Promise((resolve) => {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        resolve();
      }, 8000);
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
        ws.send(
          JSON.stringify({
            id: 2,
            method: "Runtime.evaluate",
            params: {
              expression: `window.location.href = ${JSON.stringify(links[0])}`,
            },
          }),
        );
      });
      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.method === "Runtime.exceptionThrown") {
          const d = msg.params?.exceptionDetails || {};
          all.errors.push({
            afterNav: true,
            text: d.text,
            exception: d.exception?.description || d.exception?.value,
          });
        }
      });
      ws.addEventListener("close", () => resolve());
      ws.addEventListener("error", () => resolve());
    });
    await sleep(2000);
    // recapture
    try {
      const r = await captureWithNodeWS(t.webSocketDebuggerUrl, 5000);
      all.errors.push(...r.errors.map((e) => ({ ...e, phase: "post-nav" })));
      all.logs.push(...r.logs.map((e) => ({ ...e, phase: "post-nav" })));
    } catch {}
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
  console.log("wrote", OUT);
  console.log("error count", all.errors.length);
  for (const e of all.errors) console.log(JSON.stringify(e).slice(0, 600));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

