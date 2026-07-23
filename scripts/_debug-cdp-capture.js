#!/usr/bin/env node
"use strict";
/**
 * Launch Codex rebuild with remote debugging, open a local thread URL if possible,
 * and capture console exceptions via CDP.
 */
const { spawn, execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const APP =
  os.homedir() +
  "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/Codex";
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

async function attachAndCapture(wsUrl, label, durationMs = 8000) {
  const errors = [];
  const logs = [];
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let timer;
    ws.on("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
      ws.send(JSON.stringify({ id: 2, method: "Log.enable" }));
      ws.send(JSON.stringify({ id: 3, method: "Page.enable" }));
      timer = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        resolve();
      }, durationMs);
    });
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params?.exceptionDetails;
        errors.push({
          label,
          text: d?.text,
          exception: d?.exception?.description || d?.exception?.value,
          url: d?.url,
          line: d?.lineNumber,
          stack: d?.stackTrace,
        });
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const args = (msg.params?.args || [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(" ");
        if (/error|exception|turn|oops|fail/i.test(args)) {
          logs.push({ label, type: msg.params?.type, args: args.slice(0, 500) });
        }
      }
    });
    ws.on("error", reject);
    ws.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return { errors, logs };
}

async function main() {
  // kill existing
  try {
    execSync(
      "pkill -f 'CodexDesktop-Rebuild/Codex.app' || true; pkill -f 'Codex.payload' || true",
      { stdio: "ignore" },
    );
  } catch {}
  await sleep(1500);

  const child = spawn(
    APP,
    [`--remote-debugging-port=${PORT}`, "--enable-logging=stderr"],
    {
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  const stderr = [];
  child.stderr.on("data", (b) => {
    const t = String(b);
    stderr.push(t);
    if (/error|exception|TypeError|Cannot read/i.test(t)) {
      process.stdout.write("[stderr] " + t.slice(0, 300) + "\n");
    }
  });
  child.unref();

  // wait for CDP
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
      if (Array.isArray(targets) && targets.length) break;
    } catch {}
    await sleep(500);
  }
  if (!targets || !targets.length) {
    fs.writeFileSync(
      OUT,
      JSON.stringify({ error: "no CDP targets", stderr: stderr.join("").slice(-5000) }, null, 2),
    );
    console.log("no targets");
    process.exit(1);
  }

  console.log(
    "targets",
    targets.map((t) => ({ type: t.type, title: t.title, url: t.url?.slice(0, 120) })),
  );

  const pages = targets.filter(
    (t) => t.type === "page" || t.type === "webview" || t.webSocketDebuggerUrl,
  );
  const allErrors = [];
  const allLogs = [];
  for (const t of pages.slice(0, 6)) {
    if (!t.webSocketDebuggerUrl) continue;
    console.log("attach", t.title, t.url?.slice(0, 80));
    try {
      const r = await attachAndCapture(t.webSocketDebuggerUrl, t.url || t.title, 10000);
      allErrors.push(...r.errors);
      allLogs.push(...r.logs);
    } catch (e) {
      allErrors.push({ label: t.url, attachError: String(e) });
    }
  }

  // Try navigate page to a local thread if we can find history from localStorage via CDP later
  const result = {
    targets: targets.map((t) => ({ type: t.type, title: t.title, url: t.url })),
    errors: allErrors,
    logs: allLogs,
    stderrTail: stderr.join("").slice(-8000),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log("wrote", OUT);
  console.log("errors", allErrors.length);
  for (const e of allErrors.slice(0, 20)) console.log(JSON.stringify(e).slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
