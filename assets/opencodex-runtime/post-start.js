#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = import.meta.dir;
const bun = join(root, "node_modules/bun/bin/bun");
const ocx = join(root, "node_modules/@bitkyc08/opencodex/bin/ocx.mjs");
// Refresh the OpenCodex catalog without restarting any Codex app-server.
// `--restart-codex` is intentionally not used here: the upstream restart
// helper finds processes by executable/argv and cannot distinguish this
// side-by-side runtime from the user's native ChatGPT app.
const sync = spawnSync(bun, ["run", ocx, "sync"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (sync.status !== 0) process.exit(sync.status ?? 1);

const codexHome = process.env.CODEX_HOME;
if (!codexHome) process.exit(0);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const bridgeHome = join(dirname(codexHome), "ChatGPTWebHome");
const bridgeCachePath = join(bridgeHome, "models_cache.json");
const openCodexHome = join(dirname(codexHome), "OpenCodexHome");
const openCodexCachePath = join(openCodexHome, "models_cache.json");
const runtimeHome = join(dirname(codexHome), "CodexHome");

function normalizeOpenCodexConfig() {
  const configPath = join(openCodexHome, "config.json");
  const config = readJson(configPath);
  if (!config || typeof config !== "object" || Array.isArray(config)) return;
  const providers = config.providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)
      || !providers["codex-chatgpt-web"]) return;
  if (typeof config.defaultProvider !== "string" || config.defaultProvider === "openai") {
    config.defaultProvider = "codex-chatgpt-web";
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }
}
normalizeOpenCodexConfig();

function updateCatalog(path, bridgeModels) {
  const document = readJson(path);
  if (!document || !Array.isArray(document.models)) return;
  // Never leave stale ChatGPT Web entries selectable. A cached model list is
  // safe to publish before sign-in completes; request readiness is enforced by
  // the bridge and the private Codex account route at send time.
  document.models = document.models.filter((model) =>
    typeof model?.slug !== "string" || !model.slug.startsWith("codex-chatgpt-web/"));
  const existing = new Set(document.models.map((model) => model?.slug).filter(Boolean));
  for (const source of bridgeModels) {
    const slug = `codex-chatgpt-web/${source.slug.replaceAll("/", "-")}`;
    if (existing.has(slug)) continue;
    document.models.push({
      ...source,
      slug,
      display_name: `${source.display_name || source.slug} (ChatGPT Web)`,
      description: `${source.description || "ChatGPT Web model"} Routed through the local ChatGPT Web bridge.`,
      priority: 6,
      visibility: "list",
      supported_in_api: true,
    });
  }
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
}

async function waitForChatGPTWebReadiness() {
  let lastReason = "dashboard unavailable";
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    try {
      const response = await fetch("http://127.0.0.1:17842/api/status", {
        cache: "no-store",
        signal: controller.signal,
      });
      const status = await response.json().catch(() => null);
      if (response.ok && status?.bridge?.running) {
        if (status?.ready === true) return { ready: true, status };
        return {
          ready: false,
          status,
          reason: status?.account?.message || status?.browser?.message || "route prerequisites are incomplete",
        };
      }
      lastReason = "bridge is still starting";
    } catch (error) {
      lastReason = error?.name === "AbortError" ? "dashboard health timed out" : error.message;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ready: false, reason: lastReason };
}

async function waitForOpenCodexCache() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const document = readJson(openCodexCachePath);
    if (document && Array.isArray(document.models) && document.models.length > 0) {
      return document;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

const webReadiness = await waitForChatGPTWebReadiness();
const bridgeCache = readJson(bridgeCachePath);
const bridgeModels = Array.isArray(bridgeCache?.models)
  ? bridgeCache.models.filter((model) =>
    typeof model?.slug === "string" && model.slug.startsWith("chatgpt-web/"))
  : [];
console.log(webReadiness.ready
  ? `[opencodex] ChatGPT Web route ready; publishing ${bridgeModels.length} models`
  : `[opencodex] ChatGPT Web route not ready; publishing ${bridgeModels.length} cached models: ${webReadiness.reason || "route is not ready"}`);

updateCatalog(join(codexHome, "opencodex-catalog.json"), bridgeModels);

// ocx sync refreshes the private Codex cache from the native seven-model
// provider. Replace that cache with OpenCodex's catalog before the runtime
// opens, then merge ChatGPT Web models into the combined picker.
const openCodexCache = await waitForOpenCodexCache();
if (openCodexCache) {
  const runtimeCachePath = join(codexHome, "models_cache.json");
  writeFileSync(runtimeCachePath, `${JSON.stringify(openCodexCache, null, 2)}\n`, { mode: 0o600 });
  updateCatalog(runtimeCachePath, bridgeModels);
  const finalCache = readFileSync(runtimeCachePath);
  writeFileSync(join(runtimeHome, "models_cache.json"), finalCache, { mode: 0o600 });
} else {
  updateCatalog(join(codexHome, "models_cache.json"), bridgeModels);
}

// The launcher starts the private runtime only after this hook completes on a
// cold launch. Existing runtimes intentionally keep their own app-server
// alive; a later catalog refresh is picked up on the next wrapper restart.
process.exit(0);
