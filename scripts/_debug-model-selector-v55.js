#!/usr/bin/env node
"use strict";

/**
 * Reproduce model-picker instability in an isolated Codex process.
 *
 * The running user process is never touched: this copies its Chromium profile
 * to /tmp, starts a second process with a distinct user-data directory and CDP
 * port, samples catalog-change/render activity, opens the likely model button,
 * and writes a JSON report plus screenshot under out/.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP =
  process.env.CDR_DEBUG_APP ||
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
  );
const PROFILE_SOURCE = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Profile",
);
const REUSED_PROFILE = process.env.CDR_DEBUG_REUSE_PROFILE;
const PROFILE_COPY = REUSED_PROFILE
  ? path.resolve(REUSED_PROFILE)
  : path.join(os.tmpdir(), `codex-selector-profile-${process.pid}-${Date.now()}`);
const PORT = 9364;
const REPORT = path.join(ROOT, "out", "debug-model-selector-v55.json");
const SCREENSHOT = path.join(ROOT, "out", "debug-model-selector-v55.png");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function connect(wsUrl) {
  let nextId = 1;
  const pending = new Map();
  const notifications = [];
  const socket = new WebSocket(wsUrl);
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", (event) => reject(event.error || event));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      notifications.push(message);
      return;
    }
    if (!pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  return {
    ready,
    send: async (method, params = {}) => {
      await ready;
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, 15000);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
    notifications,
  };
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "Runtime.evaluate failed",
    );
  }
  return result.result?.value;
}

async function main() {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  if (!REUSED_PROFILE) fs.cpSync(PROFILE_SOURCE, PROFILE_COPY, { recursive: true });
  for (const name of fs.readdirSync(PROFILE_COPY)) {
    if (name.startsWith("Singleton")) {
      fs.rmSync(path.join(PROFILE_COPY, name), { force: true, recursive: true });
    }
  }

  const child = spawn(
    APP,
    [
      `--user-data-dir=${PROFILE_COPY}`,
      `--remote-debugging-port=${PORT}`,
      "--enable-logging=stderr",
    ],
    {
      detached: true,
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));

  let client;
  try {
    let targets;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        targets = await getJson(`http://127.0.0.1:${PORT}/json`);
        if (Array.isArray(targets) && targets.length) break;
      } catch {}
      await sleep(500);
    }
    if (!targets?.length) {
      throw new Error(`No CDP target appeared\n${stderr.join("").slice(-12000)}`);
    }
    const page =
      targets.find((target) => (target.url || "").startsWith("app://")) ||
      targets.find((target) => target.type === "page") ||
      targets[0];
    client = connect(page.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Log.enable");
    await client.send("Network.enable");
    await sleep(8000);

    const moduleProbe = await evaluate(client, `(async()=>{try{let src=document.querySelector('script[type="module"]')?.src;if(!src)return{ok:false,reason:'no module script'};await import(src);return{ok:true}}catch(error){return{ok:false,error:String(error&&error.stack||error)}}})()`, true);

    await evaluate(
      client,
      `(() => {
        localStorage.setItem('cdr-product-mode', 'chat');
        try { globalThis.CDRRuntime && globalThis.CDRRuntime.setMode('chat'); } catch {}
        globalThis.__cdrSelectorProbe = { events: 0, mutations: 0, labels: [] };
        globalThis.__cdrSelectorProbe.errors = [];
        addEventListener('error', event => globalThis.__cdrSelectorProbe.errors.push(String(event.error && event.error.stack || event.message || event.error)));
        addEventListener('unhandledrejection', event => globalThis.__cdrSelectorProbe.errors.push(String(event.reason && event.reason.stack || event.reason)));
        addEventListener('cdr-chat-models-change', () => globalThis.__cdrSelectorProbe.events++);
        const record = () => {
          const labels = [...document.querySelectorAll('button')]
            .map(b => (b.innerText || b.getAttribute('aria-label') || '').trim())
            .filter(Boolean);
          globalThis.__cdrSelectorProbe.labels.push(labels);
        };
        const observer = new MutationObserver(() => {
          globalThis.__cdrSelectorProbe.mutations++;
          if (globalThis.__cdrSelectorProbe.labels.length < 100) record();
        });
        observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
        globalThis.__cdrSelectorProbe.observer = observer;
        record();
        return true;
      })()`,
    );
    await sleep(3000);

    const clickRect = async (rect) => {
      await client.send("Input.dispatchMouseEvent", { type:"mousePressed", x:rect.x+rect.width/2, y:rect.y+rect.height/2, button:"left", clickCount:1 });
      await client.send("Input.dispatchMouseEvent", { type:"mouseReleased", x:rect.x+rect.width/2, y:rect.y+rect.height/2, button:"left", clickCount:1 });
    };
    const switcherRect = await evaluate(client, `(() => {
      const el=[...document.querySelectorAll('button')].find(el => (el.getAttribute('aria-label') || '').startsWith('Switch mode'));
      if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,aria:el.getAttribute('aria-label')};
    })()`);
    if (switcherRect) await clickRect(switcherRect);
    await sleep(800);
    const modeItems = await evaluate(client, `([...document.querySelectorAll('button,[role="menuitem"],[role="option"],[role="button"]')]
      .filter(el=>el.getBoundingClientRect().width>0)
      .map(el=>({text:(el.innerText||'').trim(),aria:el.getAttribute('aria-label'),role:el.getAttribute('role')}))
      .filter(x=>x.text||x.aria).slice(-40))`);
    const chatRect = await evaluate(client, `(() => {
      const el=[...document.querySelectorAll('*')].find(el => (el.innerText || '').trim().startsWith('Chat\\n')&&el.children.length<4&&el.getBoundingClientRect().width>0);
      if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,role:el.getAttribute('role')};
    })()`);
    if (chatRect) await clickRect(chatRect);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await sleep(2500);
    const modeSwitch = { ok:!!chatRect, switcherRect, chatRect, mode:await evaluate(client, `localStorage.getItem('cdr-product-mode')`) };

    const modelFetch = await evaluate(
      client,
      `(async () => {
        let transportImport = null;
        let assetMarkers = null;
        try {
          const source = await (await fetch('./assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js')).text();
          assetMarkers = { v60:source.includes('same-task-chat-v60'), ensure:source.includes('sticky-chat-v45:ensure-client'), length:source.length };
        } catch (error) { assetMarkers = { error:String(error) }; }
        if (!globalThis.__cdrEnsureChatClient) {
          try {
            const transport = await import('./assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js');
            if (typeof transport.Gn === 'function') transport.Gn();
            transportImport = { ok:true, gnType:typeof transport.Gn, keys:Object.keys(transport).slice(0,40) };
          } catch (error) {
            transportImport = { ok:false, error:String(error && error.stack || error) };
          }
        }
        let client = globalThis.__cdrChatClient;
        if (!client && globalThis.__cdrEnsureChatClient) client = globalThis.__cdrEnsureChatClient();
        if (!client || typeof client.models !== 'function') return { ok:false, reason:'no chat client', transportImport, assetMarkers, ensureType:typeof globalThis.__cdrEnsureChatClient, runtimeMode:globalThis.__cdrLocalModeV4?.mode?.() };
        const data = await client.models();
        return {
          ok:true, transportImport, assetMarkers, ensureType:typeof globalThis.__cdrEnsureChatClient, runtimeMode:globalThis.__cdrLocalModeV4?.mode?.(),
          defaultModelSlug:data && data.defaultModelSlug,
          optionCount:Array.isArray(data && data.options) ? data.options.length : 0,
          versionOptionCount:Array.isArray(data && data.versionOptions) ? data.versionOptions.length : 0,
          rows:(globalThis.__cdrChatPowerRows || []).map(row => ({
            id:row.id, model:row.model, label:row.modelLabel,
            effort:row.reasoningEffort, lane:row.lane
          })),
          versions:(data.versionOptions || []).map(version => ({
            id:version.id, label:version.label, title:version.title,
            options:(version.options || []).map(option => ({
              slug:option.slug, title:option.title, selectedLabel:option.selectedLabel,
              thinkingEffort:option.thinkingEffort, lane:option.lane
            }))
          })),
        };
      })()`,
      true,
    );
    await sleep(2500);

    const buttons = await evaluate(
      client,
      `([...document.querySelectorAll('button')].map((button, index) => {
        const rect = button.getBoundingClientRect();
        return {
          index,
          text:(button.innerText || '').trim(),
          aria:button.getAttribute('aria-label'),
          testid:button.getAttribute('data-testid'),
          disabled:button.disabled,
          x:rect.x, y:rect.y, width:rect.width, height:rect.height,
        };
      }).filter(button => button.width > 0 && button.height > 0))`,
    );

    const selectorElements = await evaluate(client, `([...document.querySelectorAll('*')]
      .filter(el => {
        const text=(el.innerText || '').trim(); const r=el.getBoundingClientRect();
        return r.width>0&&r.height>0&&r.y>620&&r.x>700&&(/Custom|Instant|Medium|High|Thinking/.test(text))&&text.length<100;
      })
      .map((el,index)=>{const r=el.getBoundingClientRect();return{index,tag:el.tagName,text:(el.innerText||'').trim(),role:el.getAttribute('role'),tabindex:el.getAttribute('tabindex'),x:r.x,y:r.y,width:r.width,height:r.height,html:el.outerHTML.slice(0,800)}})
      .slice(-40))`);

    const rowLabels = new Set((modelFetch.rows || []).map((row) => row.label).filter(Boolean));
    const candidate = buttons.find((button) => button.aria === "Select ChatGPT model") || buttons.find(
      (button) =>
        /model|reasoning|thinking/i.test(`${button.aria || ""} ${button.testid || ""}`) ||
        rowLabels.has(button.text) ||
        button.text.split(/\n/).some((line) => rowLabels.has(line.trim())) ||
        /Unknown/i.test(button.text) ||
        /^(Auto|Instant|Thinking|Pro)$/i.test(button.text),
    ) || selectorElements.slice().reverse().find(el => /Custom|Instant|Medium|High|Thinking/.test(el.text));
    let advancedClick = null;
    let advancedItems = [];
    let modelClick = null;
    let modelItems = [];
    let selectionClick = null;
    if (candidate) {
      await clickRect(candidate);
      await sleep(1200);
      advancedClick = await evaluate(client, `(() => {
        const nodes = [...document.querySelectorAll('button,[role="menuitem"],[role="button"]')];
        const node = nodes.find(el => (el.innerText || '').trim() === 'Advanced' && el.getBoundingClientRect().width > 0);
        if (!node) return { ok:false };
        const r=node.getBoundingClientRect(); node.click();
        return { ok:true, tag:node.tagName, role:node.getAttribute('role'), x:r.x, y:r.y };
      })()`);
      await sleep(1200);
      advancedItems = await evaluate(client, `([...document.querySelectorAll('button,[role="menuitem"],[role="button"]')]
        .filter(el => el.getBoundingClientRect().width > 0)
        .map(el => ({text:(el.innerText || '').trim(), role:el.getAttribute('role')}))
        .filter(x => x.text && x.text.length < 300).slice(-40))`);
      if (candidate.aria === "Select ChatGPT model") {
        modelItems = advancedItems;
        selectionClick = await evaluate(client, `(() => {
          const nodes=[...document.querySelectorAll('[role="menuitem"],button')].filter(el=>el.getBoundingClientRect().width>0);
          const choices=nodes.filter(el=>/^(?:Auto|Instant|Thinking|Pro(?:\s|$)|Legacy|GPT|5\.|o\d)/i.test((el.innerText||'').trim()));
          const node=choices.find(el=>(el.innerText||'').trim()!==(document.querySelector('button[aria-label="Select ChatGPT model"]')?.innerText||'').trim())||choices[0];
          if(!node)return{ok:false,choices:choices.map(el=>(el.innerText||'').trim())};
          const text=(node.innerText||'').trim(),r=node.getBoundingClientRect();node.click();
          return{ok:true,text,choices:choices.map(el=>(el.innerText||'').trim()),disabled:node.hasAttribute('data-disabled')||node.getAttribute('aria-disabled')==='true',html:node.outerHTML.slice(0,1000),x:r.x,y:r.y,width:r.width,height:r.height};
        })()`);
        await sleep(1800);
      } else {
      modelClick = await evaluate(client, `(() => {
        const nodes = [...document.querySelectorAll('button,[role="menuitem"],[role="button"]')];
        const node = nodes.find(el => (el.innerText || '').trim().startsWith('Model') && el.getBoundingClientRect().width > 0);
        if (!node) return { ok:false };
        const r=node.getBoundingClientRect(); node.click();
        return { ok:true, text:(node.innerText || '').trim(), tag:node.tagName, role:node.getAttribute('role'), x:r.x, y:r.y };
      })()`);
      await sleep(1200);
      modelItems = await evaluate(client, `([...document.querySelectorAll('button,[role="menuitem"],[role="button"]')]
        .filter(el => el.getBoundingClientRect().width > 0)
        .map(el => ({text:(el.innerText || '').trim(), role:el.getAttribute('role')}))
        .filter(x => x.text && x.text.length < 300).slice(-40))`);
      selectionClick = await evaluate(client, `(() => {
        const nodes=[...document.querySelectorAll('[role="menuitem"]')].filter(el=>el.getBoundingClientRect().width>0);
        const choices=nodes.filter(el=>/^(?:GPT-)?(?:5\.|o3)/.test((el.innerText||'').trim()));
        const node=choices[1]||choices[0];
        if(!node)return{ok:false,choices:choices.map(el=>(el.innerText||'').trim())};
        const text=(node.innerText||'').trim(),r=node.getBoundingClientRect();return{ok:true,text,choices:choices.map(el=>(el.innerText||'').trim()),disabled:node.hasAttribute('data-disabled')||node.getAttribute('aria-disabled')==='true',html:node.outerHTML.slice(0,1000),x:r.x,y:r.y,width:r.width,height:r.height};
      })()`);
      if (selectionClick?.ok) await clickRect(selectionClick);
      await sleep(1800);
      }
    }
    await sleep(5000);

    const after = await evaluate(
      client,
      `(() => {
        const probe = globalThis.__cdrSelectorProbe || {};
        const overlays = [...document.querySelectorAll('[role="menu"],[role="dialog"],[role="listbox"],[data-radix-menu-content]')]
          .map(node => ({ role:node.getAttribute('role'), text:(node.innerText || '').trim().slice(0,5000) }));
        const recent = (probe.labels || []).slice(-20);
        const signatures = [...new Set(recent.map(labels => JSON.stringify(labels)))];
        return {
          href:location.href,
          html:document.documentElement.outerHTML.slice(0,12000),
          scripts:[...document.scripts].map(script => ({src:script.src,type:script.type})),
          resources:performance.getEntriesByType('resource').map(entry => ({name:entry.name,initiatorType:entry.initiatorType,duration:entry.duration})).slice(-100),
          mode:localStorage.getItem('cdr-product-mode'),
          events:probe.events || 0,
          mutations:probe.mutations || 0,
          errors:probe.errors || [],
          distinctButtonStates:signatures.length,
          recentButtonStates:signatures.slice(-10).map(value => JSON.parse(value)),
          overlays,
          body:(document.body.innerText || '').slice(0,12000),
          rows:(globalThis.__cdrChatPowerRows || []).map(row => ({ id:row.id, model:row.model, label:row.modelLabel, effort:row.reasoningEffort })),
          defaultSlug:globalThis.__cdrChatDefaultSlug,
          selects:[...document.querySelectorAll('select')].map(el=>({aria:el.getAttribute('aria-label'),value:el.value,options:[...el.options].map(o=>({value:o.value,text:o.text}))})),
        };
      })()`,
    );
    let screenshotError = null;
    try {
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(SCREENSHOT, Buffer.from(screenshot.data, "base64"));
    } catch (error) {
      screenshotError = String(error?.stack || error);
    }

    const report = {
      target: { title: page.title, url: page.url },
      moduleProbe,
      modeSwitch,
      modeItems,
      modelFetch,
      candidate,
      advancedClick,
      advancedItems,
      modelClick,
      modelItems,
      selectionClick,
      buttons,
      selectorElements,
      after,
      notifications: client.notifications
        .filter(message => message.method === "Runtime.exceptionThrown" || message.method === "Runtime.consoleAPICalled" || message.method === "Log.entryAdded" || message.method === "Network.loadingFailed")
        .slice(-100),
      stderrTail: stderr.join("").slice(-12000),
      screenshotError,
      screenshot: SCREENSHOT,
    };
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    try {
      client?.close();
    } catch {}
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
