#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const enhancementRoot = resolve(import.meta.dir);
const dashboardRoot = join(import.meta.dir, "public");
const portArgumentIndex = process.argv.indexOf("--port");
const port = Number.parseInt(
  portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : process.env.CODEX_CHATGPT_WEB_DASHBOARD_PORT || "17842",
  10,
);
const bridgePort = Number.parseInt(process.env.CODEX_CHATGPT_WEB_PORT || "17841", 10);
const bridgeHome = process.env.CODEX_CHATGPT_WEB_HOME || join(process.env.HOME || "", ".codex-chatgpt-web");
const bridgeConfigPath = join(bridgeHome, "config.json");
const bridgeBinary = join(enhancementRoot, "runtime", "bun");
const bridgeCli = join(enhancementRoot, "app", "cli.js");

let bridgeProcess = null;

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

async function ensureBridge() {
  if (bridgeProcess || !bridgeConfigured() || await bridgeHealth()) return;
  bridgeProcess = spawn(bridgeBinary, [bridgeCli, "serve"], {
    cwd: enhancementRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  bridgeProcess.stdout?.on("data", (chunk) => process.stdout.write(`[codex-chatgpt-web] ${chunk}`));
  bridgeProcess.stderr?.on("data", (chunk) => process.stderr.write(`[codex-chatgpt-web] ${chunk}`));
  bridgeProcess.once("exit", () => {
    bridgeProcess = null;
  });
}

async function runDoctor() {
  return new Promise((resolveResult) => {
    const child = spawn(bridgeBinary, [bridgeCli, "doctor", "--json"], {
      cwd: enhancementRoot,
      env: { ...process.env },
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
    return json({
      dashboard: { status: "ok", port },
      bridge: {
        configured: bridgeConfigured(),
        running: Boolean(health),
        health,
      },
      links: {
        chatgpt: "https://chatgpt.com",
        upstream: "https://github.com/miuuyy/codex-chatgpt-web",
      },
    });
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
ensureBridge().catch((error) => console.error(`[codex-chatgpt-web] bridge startup failed: ${error.message}`));

function shutdown() {
  bridgeProcess?.kill("SIGTERM");
  server.stop();
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
