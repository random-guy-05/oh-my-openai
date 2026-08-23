#!/usr/bin/env bun

// Managed, non-terminal ChatGPT Web login flow.
// The upstream CLI's browser-only login waits for the user to quit its
// temporary Chrome instance. That is a poor fit for a menu-bar app, so this
// wrapper watches the isolated profile until the ChatGPT composer is visible,
// persists the session, closes only that temporary browser, and then lets the
// upstream CLI finish its normal setup/configuration work.

import { cpSync, mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const root = resolve(import.meta.dir);
const home = resolve(process.env.CODEX_CHATGPT_WEB_HOME || join(homedir(), ".codex-chatgpt-web"));
const browserRoot = join(home, "browser");
const loginProfile = join(browserRoot, "login-profile");
const chromeUserDataRoot = resolve(process.env.CODEX_CHATGPT_WEB_CHROME_DATA || join(homedir(), "Library/Application Support/Google/Chrome"));
const chromeProfileName = process.env.CODEX_CHATGPT_WEB_CHROME_PROFILE || "Default";
const profileSeedMarker = join(browserRoot, "profile-seed.json");
const storageStatePath = join(browserRoot, "storage-state.json");
const verifiedPath = `${storageStatePath}.verified.json`;
const chromeExecutable = process.env.CODEX_CHATGPT_WEB_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const loginUrl = "https://chatgpt.com/?temporary-chat=true";
const bridgePort = Number.parseInt(process.env.CODEX_CHATGPT_WEB_PORT || "17841", 10);
const composerSelector = [
  '[data-testid="prompt-textarea"]',
  "#prompt-textarea",
  '[contenteditable="true"][data-lexical-editor="true"]',
].join(", ");

function log(message) {
  process.stdout.write(`[codex-chatgpt-web] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[codex-chatgpt-web] ${message}\n`);
  process.exitCode = 1;
}

function seedLoginProfile() {
  if (existsSync(profileSeedMarker)) return false;
  const sourceProfile = join(chromeUserDataRoot, chromeProfileName);
  const sourcePreferences = join(sourceProfile, "Preferences");
  if (!existsSync(sourcePreferences)) return false;
  if (existsSync(loginProfile)) {
    renameSync(loginProfile, `${loginProfile}.legacy-${Date.now()}`);
  }
  const targetProfile = join(loginProfile, "Default");
  mkdirSync(targetProfile, { recursive: true, mode: 0o700 });
  cpSync(sourceProfile, targetProfile, {
    recursive: true,
    filter: (sourcePath) => !["SingletonCookie", "SingletonLock", "SingletonSocket", "LOCK"].includes(sourcePath.split("/").at(-1)),
  });
  const sourceLocalState = join(chromeUserDataRoot, "Local State");
  if (existsSync(sourceLocalState)) cpSync(sourceLocalState, join(loginProfile, "Local State"));
  writeFileSync(profileSeedMarker, JSON.stringify({
    version: 1,
    sourceProfile: chromeProfileName,
    seededAt: new Date().toISOString(),
  }, null, 2) + "\n", { mode: 0o600 });
  log(`Reused the existing Chrome ${chromeProfileName} account session in the app-owned profile.`);
  return true;
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

function runSetupAttempt(restartService) {
  return new Promise((resolveSetup, rejectSetup) => {
    const argumentsForSetup = [
      join(root, "app", "cli.js"),
      "setup",
      "--browser-only",
      "--acknowledge-unofficial",
      ...(restartService ? ["--restart-service"] : []),
    ];
    const child = spawn(process.execPath, argumentsForSetup, {
      cwd: root,
      env: {
        ...process.env,
        CODEX_CHATGPT_WEB_HOME: home,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", rejectSetup);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveSetup();
      else rejectSetup(new Error(`ChatGPT setup exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

async function waitForBridgeHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${bridgePort}/healthz`);
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.status === "ok") return true;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return false;
}

async function runSetup() {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await runSetupAttempt(attempt === 0);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
      log("The local bridge is still starting; waiting for it to become healthy before retrying setup…");
      await waitForBridgeHealth(30_000);
    }
  }
  throw lastError;
}

class DevToolsClient {
  constructor(webSocketUrl) {
    this.socket = null;
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || "Chrome DevTools command failed"));
      else request.resolve(message.result || {});
    });
    this.socket.addEventListener("close", () => {
      for (const request of this.pending.values()) request.reject(new Error("Temporary ChatGPT browser closed"));
      this.pending.clear();
    });
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(() => rejectOpen(new Error("Chrome DevTools connection timed out")), 10_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolveOpen();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        rejectOpen(new Error("Chrome DevTools connection failed"));
      }, { once: true });
    });
  }

  command(method, params = {}, sessionId) {
    return new Promise((resolveCommand, rejectCommand) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

async function waitForDevTools(port) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 45_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Chrome DevTools returned HTTP ${response.status}`);
      const version = await response.json();
      if (!version.webSocketDebuggerUrl) throw new Error("Chrome DevTools did not provide a WebSocket endpoint");
      const client = new DevToolsClient(version.webSocketDebuggerUrl);
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw new Error(`The temporary ChatGPT browser did not become controllable${lastError ? `: ${lastError.message}` : ""}`);
}

async function waitForChatGPTPage(client) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const targets = await client.command("Target.getTargets");
    const target = targets.targetInfos?.find((candidate) => candidate.type === "page" && !candidate.url.startsWith("chrome://"));
    if (target) {
      const attached = await client.command("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      const sessionId = attached.sessionId;
      await client.command("Runtime.enable", {}, sessionId);
      await client.command("Page.enable", {}, sessionId);
      await client.command("Page.navigate", { url: loginUrl }, sessionId);
      return sessionId;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("The temporary ChatGPT browser did not open a page");
}

async function evaluate(client, sessionId, expression) {
  const result = await client.command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);
  if (result.exceptionDetails) throw new Error("The ChatGPT page could not be inspected");
  return result.result?.value;
}

async function waitForComposer(client, sessionId) {
  const deadline = Date.now() + 10 * 60_000;
  const expression = `(() => {
    const selector = ${JSON.stringify(composerSelector)};
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    };
    const composerVisible = [...document.querySelectorAll(selector)].some(visible);
    const visibleLoginControl = [...document.querySelectorAll("button, a")].some((element) =>
      visible(element) && /^(log in|sign up)$/i.test((element.innerText || element.textContent || "").trim())
    );
    const bodyText = (document.body?.innerText || "").replace(/\\s+/g, " ");
    const loggedOutMarker = /Log in to get answers based on saved chats|Sign up for free|Your session has expired/i.test(bodyText);
    return { composerVisible, loggedOut: visibleLoginControl || loggedOutMarker, pageReady: document.readyState === "complete" };
  })()`;
  let authenticatedSince = null;
  while (Date.now() < deadline) {
    try {
      const state = await evaluate(client, sessionId, expression);
      if (state?.loggedOut) {
        throw new Error("ChatGPT is not signed in in the connection profile. Sign in to ChatGPT in that window, then Connect again.");
      }
      if (state?.composerVisible && state?.pageReady) {
        authenticatedSince ??= Date.now();
        if (Date.now() - authenticatedSince >= 2_000) return;
      } else {
        authenticatedSince = null;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not signed in")) throw error;
      authenticatedSince = null;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("ChatGPT authentication could not be verified: no visible composer is present");
}

async function captureStorageState(client, sessionId) {
  const cookieResult = await client.command("Network.getAllCookies", {}, sessionId);
  const localStorage = await evaluate(client, sessionId, `(() => {
    try { return Object.entries(localStorage).map(([name, value]) => ({ name, value })); }
    catch { return []; }
  })()`);
  return {
    cookies: (cookieResult.cookies || []).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    })),
    origins: [{ origin: "https://chatgpt.com", localStorage: localStorage || [] }],
  };
}

async function restoreStorageState(client, sessionId) {
  if (!existsSync(storageStatePath)) return false;
  try {
    const state = JSON.parse(readFileSync(storageStatePath, "utf8"));
    if (Array.isArray(state.cookies) && state.cookies.length > 0) {
      await client.command("Network.setCookies", { cookies: state.cookies }, sessionId);
    }
    const originState = Array.isArray(state.origins)
      ? state.origins.find((origin) => origin.origin === "https://chatgpt.com")
      : null;
    if (Array.isArray(originState?.localStorage) && originState.localStorage.length > 0) {
      await evaluate(client, sessionId, `(() => {
        for (const entry of ${JSON.stringify(originState.localStorage)}) {
          localStorage.setItem(entry.name, entry.value);
        }
        return true;
      })()`);
    }
    await client.command("Page.navigate", { url: loginUrl }, sessionId);
    return true;
  } catch (error) {
    log(`Saved ChatGPT session could not be restored; sign in in the private window (${error.message}).`);
    return false;
  }
}

async function login() {
  if (!existsSync(chromeExecutable)) {
    throw new Error(`Google Chrome was not found at ${chromeExecutable}`);
  }

  mkdirSync(browserRoot, { recursive: true, mode: 0o700 });
  mkdirSync(loginProfile, { recursive: true, mode: 0o700 });
  const seededProfile = seedLoginProfile();
  const port = await findFreePort();
  log("Opening a private ChatGPT sign-in window…");

  const chrome = spawn(chromeExecutable, [
    `--user-data-dir=${loginProfile}`,
    "--new-window",
    "--disable-background-mode",
    "--no-first-run",
    "--no-default-browser-check",
    "--profile-directory=Default",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    loginUrl,
  ], { env: process.env, stdio: "ignore" });

  let client;
  try {
    client = await waitForDevTools(port);
    const sessionId = await waitForChatGPTPage(client);
    if (!seededProfile) await restoreStorageState(client, sessionId);
    log("Sign in to ChatGPT in this private window if needed; the window will close automatically when the composer is ready.");
    await waitForComposer(client, sessionId);

    const storageState = await captureStorageState(client, sessionId);
    writeFileSync(storageStatePath, JSON.stringify(storageState, null, 2) + "\n", { mode: 0o600 });
    writeFileSync(verifiedPath, JSON.stringify({
      version: 1,
      authenticated: true,
      verifiedAt: new Date().toISOString(),
      solAvailable: true,
      proAvailable: false,
    }, null, 2) + "\n", { mode: 0o600 });
    log("ChatGPT sign-in verified. Finishing connection setup…");
  } finally {
    try { client?.close(); } catch {}
    try { chrome.kill("SIGTERM"); } catch {}
  }

  // Keep the isolated profile so the one-time sign-in is remembered for the
  // next Connect click. It never touches the user's normal Chrome profile.
  await runSetup();
  log("ChatGPT Web is connected.");
}

login().catch((error) => fail(error instanceof Error ? error.message : String(error)));
