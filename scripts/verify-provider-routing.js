#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const appPath = path.resolve(process.argv[2] || "out/side-by-side-mac-x64/Codex.app");
const enhancementRoot = path.join(appPath, "Contents/Resources/enhancements/opencodex");
const bun = path.join(enhancementRoot, "node_modules/bun/bin/bun.exe");
const ocx = path.join(enhancementRoot, "node_modules/@bitkyc08/opencodex/bin/ocx.mjs");
assert.ok(fs.existsSync(bun), `Missing bundled Bun runtime: ${bun}`);
assert.ok(fs.existsSync(ocx), `Missing bundled OpenCodex CLI: ${ocx}`);

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

// A newly copied/signed Bun + OpenCodex tree can spend close to a minute in
// macOS first-run verification. Match the product's bounded cold-start budget
// so this release gate is strict without being timing-flaky on a fresh bundle.
async function waitFor(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let reason = "not reachable";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
      reason = `HTTP ${response.status}`;
    } catch (error) {
      reason = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}: ${reason}`);
}

async function main() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-routing-test-"));
  const openCodexHome = path.join(temporaryRoot, "OpenCodexHome");
  const codexHome = path.join(temporaryRoot, "CodexHome");
  fs.mkdirSync(openCodexHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });

  const requests = [];
  const upstream = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    request.resume();
    request.once("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "resp_route_probe",
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: "chatgpt-web/light",
        output: [],
        usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
      }));
    });
  });
  const upstreamPort = await listen(upstream);

  const portProbe = http.createServer();
  const gatewayPort = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));

  fs.writeFileSync(path.join(openCodexHome, "config.json"), `${JSON.stringify({
    port: gatewayPort,
    defaultProvider: "routing-probe",
    providers: {
      "routing-probe": {
        adapter: "openai-responses",
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        authMode: "forward",
        allowPrivateNetwork: true,
        models: ["chatgpt-web/light"],
        liveModels: false,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const output = [];
  const gateway = spawn(bun, ["run", ocx, "start", "--port", String(gatewayPort)], {
    cwd: enhancementRoot,
    env: {
      ...process.env,
      HOME: temporaryRoot,
      CODEX_HOME: codexHome,
      OPENCODEX_HOME: openCodexHome,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  gateway.stdout.on("data", (chunk) => output.push(chunk));
  gateway.stderr.on("data", (chunk) => output.push(chunk));

  try {
    await waitFor(`http://127.0.0.1:${gatewayPort}/healthz`);
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/responses`, {
      method: "POST",
      headers: {
        authorization: "Bearer routing-test-token",
        "content-type": "application/json",
      },
      // Codex-facing provider slugs flatten the inner slash; OpenCodex must
      // decode it back to the configured native model id before forwarding.
      body: JSON.stringify({ model: "routing-probe/chatgpt-web-light", input: "route probe", stream: false }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    assert.ok(response.status < 500, `OpenCodex returned ${response.status}: ${body}`);
    assert.ok(requests.some((request) => request.method === "POST" && request.url === "/v1/responses"),
      `Responses adapter did not call /v1/responses; observed ${JSON.stringify(requests)}`);
    assert.ok(!requests.some((request) => request.url.includes("chat/completions")),
      `Responses provider incorrectly called chat/completions: ${JSON.stringify(requests)}`);
    console.log(`[ok] OpenCodex forwarded POST /v1/responses to the Responses-only provider (HTTP ${response.status})`);
  } catch (error) {
    const diagnostic = Buffer.concat(output).toString("utf8").trim();
    if (diagnostic) error.message = `${error.message}\nOpenCodex output:\n${diagnostic}`;
    throw error;
  } finally {
    gateway.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => gateway.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (gateway.exitCode == null) gateway.kill("SIGKILL");
    await new Promise((resolve) => upstream.close(resolve));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[x] ${error.stack || error.message}`);
  process.exitCode = 1;
});
