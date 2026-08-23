#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const appPath = path.resolve(process.argv[2] || "out/side-by-side-mac-x64/Codex.app");
const enhancementRoot = path.join(appPath, "Contents/Resources/enhancements/codex-chatgpt-web");
const bun = path.join(enhancementRoot, "runtime/bun");
const serverScript = path.join(enhancementRoot, "server.js");
assert.ok(fs.existsSync(bun), `Missing bundled bridge runtime: ${bun}`);
assert.ok(fs.existsSync(serverScript), `Missing bundled dashboard: ${serverScript}`);

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForStatus(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let reason = "not reachable";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(1500) });
      if (response.ok) return await response.json();
      reason = `HTTP ${response.status}`;
    } catch (error) {
      reason = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}: ${reason}`);
}

async function portIsClosed(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(300) });
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function main() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-lifecycle-test-"));
  const codexHome = path.join(temporaryRoot, "CodexHome");
  const bridgeHome = path.join(temporaryRoot, "ChatGPTWebHome");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const [dashboardPort, bridgePort, openCodexPort] = await Promise.all([
    reservePort(), reservePort(), reservePort(),
  ]);
  const output = [];
  const dashboard = spawn(bun, ["run", serverScript, "--port", String(dashboardPort)], {
    cwd: enhancementRoot,
    env: {
      ...process.env,
      HOME: temporaryRoot,
      CODEX_HOME: codexHome,
      CODEX_CHATGPT_WEB_HOME: bridgeHome,
      CODEX_CHATGPT_WEB_PORT: String(bridgePort),
      OPENCODEX_PORT: String(openCodexPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  dashboard.stdout.on("data", (chunk) => output.push(chunk));
  dashboard.stderr.on("data", (chunk) => output.push(chunk));

  try {
    const dashboardHealth = await waitForStatus(`http://127.0.0.1:${dashboardPort}/healthz`);
    assert.equal(dashboardHealth.status, "ok");
    assert.equal(dashboardHealth.service, "codex-chatgpt-web-dashboard");
    assert.equal(dashboardHealth.pid, dashboard.pid);
    const status = await waitForStatus(`http://127.0.0.1:${dashboardPort}/api/status`);
    assert.equal(status.dashboard?.service, "codex-chatgpt-web-dashboard");
    assert.equal(status.bridge?.running, true);
    assert.equal(status.bridge?.health?.service, "codex-chatgpt-web");
    assert.equal(status.bridge?.health?.accepting_turns, true);
    assert.equal(status.account?.status, "error");
    assert.equal(status.browser?.authenticated, false);
    assert.equal(status.ready, false);
    assert.equal(fs.existsSync(path.join(codexHome, "auth.json")), false,
      "Dashboard created or copied an auth.json into the isolated Codex home");
  } catch (error) {
    const diagnostic = Buffer.concat(output).toString("utf8").trim();
    if (diagnostic) error.message = `${error.message}\nDashboard output:\n${diagnostic}`;
    throw error;
  } finally {
    dashboard.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => dashboard.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    if (dashboard.exitCode == null) dashboard.kill("SIGKILL");
  }

  assert.equal(await portIsClosed(bridgePort), true,
    "ChatGPT Web bridge remained reachable after its dashboard owner quit");
  assert.equal(await portIsClosed(dashboardPort), true,
    "ChatGPT Web dashboard remained reachable after shutdown");
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  console.log("[ok] dashboard and bridge start together, expose honest readiness, copy no auth, and stop together");
}

main().catch((error) => {
  console.error(`[x] ${error.stack || error.message}`);
  process.exitCode = 1;
});
