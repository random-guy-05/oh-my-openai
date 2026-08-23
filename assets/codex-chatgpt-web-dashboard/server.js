#!/usr/bin/env bun

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const enhancementRoot = resolve(import.meta.dir);
const dashboardRoot = join(import.meta.dir, "public");
const portArgumentIndex = process.argv.indexOf("--port");
const port = Number.parseInt(
  portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : process.env.CODEX_CHATGPT_WEB_DASHBOARD_PORT || "17842",
  10,
);
const bridgePort = Number.parseInt(process.env.CODEX_CHATGPT_WEB_PORT || "17841", 10);
const openCodexPort = Number.parseInt(process.env.OPENCODEX_PORT || "10100", 10);
const bridgeHome = process.env.CODEX_CHATGPT_WEB_HOME || join(process.env.HOME || "", ".codex-chatgpt-web");
const bridgeConfigPath = join(bridgeHome, "config.json");
const codexHome = process.env.CODEX_HOME || join(process.env.HOME || "", ".codex");
const codexConfigPath = join(codexHome, "config.toml");
const sourceCodexHome = join(homedir(), ".codex");
const sourceAuthPath = join(sourceCodexHome, "auth.json");
const codexAuthPath = join(codexHome, "auth.json");
const integrationJournalPaths = [
  join(bridgeHome, "codex", "integration-journal.json"),
  join(bridgeHome, "codex", "integration-journal.recovery.json"),
];
const bridgePidPath = join(bridgeHome, "bridge.pid");
const bridgeBinary = join(enhancementRoot, "runtime", "bun");
const bridgeCli = join(enhancementRoot, "app", "cli.js");

let bridgeProcess = null;
let bridgeStartupPromise = null;
let setupProcess = null;
let setupState = "idle";
let setupExitCode = null;
let setupOutput = "";
let accountHealthCache = { checkedAt: 0, result: null };

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function bridgeHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`http://127.0.0.1:${bridgePort}/healthz`, { signal: controller.signal });
    const payload = await response.json().catch(() => null);
    return response.ok && payload ? payload : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function bridgeConfigured() {
  return existsSync(bridgeConfigPath);
}

function ensurePrivateCodexHome() {
  mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  ensurePrivateBridgeConfig();
  syncCodexAuth();
  if (!existsSync(codexConfigPath)) {
    writeFileSync(codexConfigPath, 'model = "gpt-5.6-sol"\n', { mode: 0o600 });
  }
  for (const journalPath of integrationJournalPaths) {
    if (!existsSync(journalPath)) continue;
    try {
      const journal = JSON.parse(readFileSync(journalPath, "utf8"));
      if (journal.configPath && resolve(journal.configPath) !== resolve(codexConfigPath)) {
        const stalePath = `${journalPath}.stale-${process.pid}`;
        renameSync(journalPath, stalePath);
        console.log(`[codex-chatgpt-web] moved stale integration journal to ${stalePath}`);
      }
    } catch {
      // A malformed journal is left in place for the upstream CLI to report.
    }
  }
}

function ensurePrivateBridgeConfig() {
  mkdirSync(bridgeHome, { recursive: true, mode: 0o700 });
  let config = null;
  for (const candidate of [bridgeConfigPath, join(homedir(), ".codex-chatgpt-web", "config.json")]) {
    if (!existsSync(candidate)) continue;
    try {
      config = JSON.parse(readFileSync(candidate, "utf8"));
      if (config && typeof config === "object" && !Array.isArray(config)) break;
    } catch {
      config = null;
    }
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    config = {
      version: 3,
      releaseVersion: "2.1.11",
      mode: "browser-only",
      host: "127.0.0.1",
      port: bridgePort,
      contextWindow: 256000,
      appName: "Codex Native2",
      browserHost: "managed-chrome",
      chromeExecutablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headed: true,
      solAvailable: true,
      proAvailable: false,
      autoApproveToolCalls: false,
      controlToken: randomBytes(32).toString("base64url"),
      acknowledgedUnofficialAt: new Date().toISOString(),
    };
  }

  config.version = 3;
  config.mode = "browser-only";
  config.host = "127.0.0.1";
  config.port = bridgePort;
  config.browserHost = "managed-chrome";
  config.storageStatePath = join(bridgeHome, "browser", "storage-state.json");
  config.brokerSocketPath = join(bridgeHome, "runtime", "turn-broker.sock");
  config.runtimeCommand = [bridgeBinary, bridgeCli];
  config.controlToken ||= randomBytes(32).toString("base64url");
  config.acknowledgedUnofficialAt ||= new Date().toISOString();
  writeFileSync(bridgeConfigPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(bridgeConfigPath, 0o600);
}

function syncCodexAuth() {
  if (resolve(codexHome) === resolve(sourceCodexHome) || !existsSync(sourceAuthPath)) return;
  try {
    const source = JSON.parse(readFileSync(sourceAuthPath, "utf8"));
    const sourceAccessToken = source?.tokens?.access_token;
    if (typeof sourceAccessToken !== "string" || sourceAccessToken.length < 20) return;
    let currentAccessToken = null;
    if (existsSync(codexAuthPath)) {
      try {
        currentAccessToken = JSON.parse(readFileSync(codexAuthPath, "utf8"))?.tokens?.access_token;
      } catch {}
    }
    if (currentAccessToken !== sourceAccessToken) {
      copyFileSync(sourceAuthPath, codexAuthPath);
      chmodSync(codexAuthPath, 0o600);
      console.log("[codex-chatgpt-web] synchronized account auth into the isolated Codex home");
    }
  } catch (error) {
    console.warn(`[codex-chatgpt-web] account auth could not be synchronized: ${error.message}`);
  }
}

async function accountRouteHealth(force = false) {
  if (!force && accountHealthCache.result && Date.now() - accountHealthCache.checkedAt < 10_000) {
    return accountHealthCache.result;
  }
  syncCodexAuth();
  let accessToken;
  try {
    accessToken = JSON.parse(readFileSync(codexAuthPath, "utf8"))?.tokens?.access_token;
  } catch {
    accessToken = null;
  }
  if (typeof accessToken !== "string" || accessToken.length < 20) {
    accountHealthCache = {
      checkedAt: Date.now(),
      result: { status: "error", message: "The isolated Codex runtime has no ChatGPT account credential." },
    };
    return accountHealthCache.result;
  }
  try {
    const response = await fetch(`http://127.0.0.1:${bridgePort}/v1/models?client_version=0.144.0`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json().catch(() => null);
    const models = Array.isArray(payload?.models) ? payload.models : [];
    const result = response.ok && models.length > 0
      ? { status: "ok", modelCount: models.length, models: models.map((model) => model.slug).filter(Boolean).slice(0, 20) }
      : { status: "error", message: payload?.error?.message || `ChatGPT account request failed with HTTP ${response.status}.` };
    accountHealthCache = { checkedAt: Date.now(), result };
    return result;
  } catch (error) {
    accountHealthCache = { checkedAt: Date.now(), result: { status: "error", message: error.message } };
    return accountHealthCache.result;
  }
}

async function ensureBridge() {
  if (bridgeStartupPromise) return bridgeStartupPromise;

  bridgeStartupPromise = (async () => {
    const alreadyHealthy = await bridgeHealth();
    if (alreadyHealthy) return alreadyHealthy;

    mkdirSync(bridgeHome, { recursive: true, mode: 0o700 });
    bridgeProcess = spawn(bridgeBinary, [bridgeCli, "serve"], {
      cwd: enhancementRoot,
      env: {
        ...process.env,
        CODEX_CHATGPT_WEB_HOME: bridgeHome,
        CODEX_CHATGPT_WEB_PORT: String(bridgePort),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    bridgeProcess.stdout?.on("data", (chunk) => {
      setupOutput = `${setupOutput}\n${chunk.toString("utf8")}`.slice(-1200);
    });
    bridgeProcess.stderr?.on("data", (chunk) => {
      setupOutput = `${setupOutput}\n${chunk.toString("utf8")}`.slice(-1200);
    });
    bridgeProcess.once("exit", () => {
      bridgeProcess = null;
      try { unlinkSync(bridgePidPath); } catch {}
    });
    writeFileSync(bridgePidPath, `${bridgeProcess.pid}\n`, { mode: 0o600 });

    const ownedProcess = bridgeProcess;
    // Browser-only startup can take several seconds while the managed Chrome
    // profile is initialized. Keep one owner waiting instead of timing out
    // and allowing the next dashboard request to spawn a duplicate bridge.
    for (let attempt = 0; attempt < 120; attempt++) {
      if (ownedProcess?.exitCode == null && await bridgeHealth()) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (ownedProcess?.exitCode == null) ownedProcess.kill("SIGTERM");
    throw new Error(`ChatGPT Web bridge did not become healthy on port ${bridgePort}.`);
  })().finally(() => {
    bridgeStartupPromise = null;
  });
  return bridgeStartupPromise;
}

function connectionStatus() {
  return {
    state: setupState,
    running: Boolean(setupProcess),
    exitCode: setupExitCode,
    output: setupOutput.slice(-1200),
  };
}

function startConnection() {
  if (setupProcess) return connectionStatus();

  ensurePrivateCodexHome();
  setupState = "starting";
  setupExitCode = null;
  setupOutput = "Opening a private ChatGPT sign-in window…";
  setupProcess = spawn(bridgeBinary, [
    "run",
    join(enhancementRoot, "login.js"),
  ], {
    cwd: enhancementRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  setupProcess.stdout?.on("data", (chunk) => {
    setupState = "running";
    setupOutput = `${setupOutput}\n${chunk.toString("utf8")}`.slice(-1200);
  });
  setupProcess.stderr?.on("data", (chunk) => {
    setupOutput = `${setupOutput}\n${chunk.toString("utf8")}`.slice(-1200);
  });
  setupProcess.once("error", (error) => {
    setupState = "failed";
    setupExitCode = 1;
    setupOutput = `${setupOutput}\n${error.message}`.slice(-1200);
    setupProcess = null;
  });
  setupProcess.once("exit", (code, signal) => {
    const exitCode = code ?? (signal ? 1 : 0);
    setupExitCode = exitCode;
    setupProcess = null;
    void (async () => {
      if (exitCode !== 0) {
        setupState = "failed";
        setupOutput = `${setupOutput}\nConnection flow finished with exit code ${exitCode}.`.slice(-1200);
        return;
      }
      const account = await accountRouteHealth(true);
      if (account.status !== "ok") {
        setupState = "failed";
        setupExitCode = 1;
        setupOutput = `${setupOutput}\nConnection was not completed: ${account.message}`.slice(-1200);
        return;
      }
      setupState = "ready";
      setupOutput = `${setupOutput}\nVerified ChatGPT account access (${account.modelCount} models available). Connection flow finished with success.`.slice(-1200);
    })();
  });
  return connectionStatus();
}

async function serviceHealth(portNumber, pathName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`http://127.0.0.1:${portNumber}${pathName}`, { signal: controller.signal });
    return { running: response.ok, port: portNumber };
  } catch {
    return { running: false, port: portNumber };
  } finally {
    clearTimeout(timeout);
  }
}

async function runDoctor() {
  ensurePrivateCodexHome();
  return new Promise((resolveResult) => {
    const child = spawn(bridgeBinary, [bridgeCli, "doctor", "--json"], {
      cwd: enhancementRoot,
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    const errors = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolveResult({ ok: false, error: "Doctor timed out after 15 seconds." });
    }, 15_000);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.once("exit", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8").trim();
      if (code === 0) {
        try {
          resolveResult(JSON.parse(output));
          return;
        } catch {}
      }
      resolveResult({
        ok: false,
        error: errors.length > 0 ? Buffer.concat(errors).toString("utf8").trim() : `Doctor exited with code ${code ?? "unknown"}.`,
      });
    });
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function handle(request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/status") {
    await ensureBridge();
    const health = await bridgeHealth();
    const opencodex = await serviceHealth(openCodexPort, "/healthz");
    return json({
      dashboard: { status: "ok", port },
      opencodex,
      bridge: {
        configured: bridgeConfigured(),
        running: Boolean(health),
        health,
      },
      account: await accountRouteHealth(),
      connection: connectionStatus(),
      links: {
        chatgpt: "https://chatgpt.com",
        upstream: "https://github.com/miuuyy/codex-chatgpt-web",
      },
    });
  }
  if (url.pathname === "/api/connect") {
    if (request.method !== "POST") return json({ error: "Use POST to start ChatGPT connection." }, 405);
    return json(startConnection(), 202);
  }
  if (url.pathname === "/api/doctor") {
    return json(await runDoctor());
  }
  if (url.pathname === "/api/bridge-health") {
    const health = await bridgeHealth();
    return json(health || { status: "unavailable", port: bridgePort }, health ? 200 : 503);
  }
  if (url.pathname === "/") {
    return new Response(Bun.file(join(dashboardRoot, "index.html")), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const relativePath = url.pathname.replace(/^\//, "");
  const filePath = resolve(dashboardRoot, relativePath);
  if (!filePath.startsWith(`${dashboardRoot}/`)) return new Response("Not found", { status: 404 });
  if (!existsSync(filePath)) return new Response("Not found", { status: 404 });
  return new Response(Bun.file(filePath), {
    headers: { "content-type": contentType(filePath), "cache-control": "no-store" },
  });
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: handle,
});

console.log(`[codex-chatgpt-web] dashboard listening on http://127.0.0.1:${server.port}`);
ensurePrivateCodexHome();
ensureBridge().catch((error) => console.error(`[codex-chatgpt-web] bridge startup failed: ${error.message}`));

function shutdown() {
  setupProcess?.kill("SIGTERM");
  bridgeProcess?.kill("SIGTERM");
  try { unlinkSync(bridgePidPath); } catch {}
  server.stop();
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
