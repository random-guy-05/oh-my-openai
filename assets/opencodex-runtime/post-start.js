#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = import.meta.dir;
const bun = join(root, "node_modules/bun/bin/bun.exe");
const ocx = join(root, "node_modules/@bitkyc08/opencodex/bin/ocx.mjs");
// First refresh the native OpenCodex catalog without restarting the long-lived
// app-server. We add the bridge models after that write, then use sync-cache
// to publish the merged catalog and restart the app-server exactly once.
const sync = spawnSync(bun, ["run", ocx, "sync"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (sync.status !== 0) process.exit(sync.status ?? 1);

const codexHome = process.env.CODEX_HOME;
if (!codexHome) process.exit(0);

const bridgeHome = join(dirname(codexHome), "ChatGPTWebHome");
const bridgeCachePath = join(bridgeHome, "models_cache.json");
if (!existsSync(bridgeCachePath)) process.exit(0);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const bridgeCache = readJson(bridgeCachePath);
const bridgeModels = Array.isArray(bridgeCache?.models)
  ? bridgeCache.models.filter((model) => typeof model?.slug === "string" && model.slug.startsWith("chatgpt-web/"))
  : [];
if (bridgeModels.length === 0) process.exit(0);

function mergeInto(path) {
  const document = readJson(path);
  if (!document || !Array.isArray(document.models)) return;
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

mergeInto(join(codexHome, "opencodex-catalog.json"));
mergeInto(join(codexHome, "models_cache.json"));

const restart = spawnSync(bun, ["run", ocx, "sync-cache", "--restart-codex"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
process.exit(restart.status ?? 1);
