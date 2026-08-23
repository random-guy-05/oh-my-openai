#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = import.meta.dir;
const bun = join(root, "node_modules/bun/bin/bun.exe");
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

function updateCatalog(path) {
  const document = readJson(path);
  if (!document || !Array.isArray(document.models)) return;
  const bridgeCache = readJson(bridgeCachePath);
  const bridgeModels = Array.isArray(bridgeCache?.models)
    ? bridgeCache.models.filter((model) =>
      typeof model?.slug === "string" && model.slug.startsWith("chatgpt-web/"))
    : [];
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

if (existsSync(bridgeCachePath)) {
  updateCatalog(join(codexHome, "opencodex-catalog.json"));
  updateCatalog(join(codexHome, "models_cache.json"));
}

// The launcher starts the private runtime only after this hook completes on a
// cold launch. Existing runtimes intentionally keep their own app-server
// alive; a later catalog refresh is picked up on the next wrapper restart.
process.exit(0);
