#!/usr/bin/env node
/**
 * Force the side-by-side runtime onto the isolated Electron profile even when
 * launched without CodexLauncher (Dock/Spotlight opening the runtime binary).
 *
 * Without this, Electron defaults to ~/Library/Application Support/Codex and
 * collides with the official ChatGPT.app — which shows as an endless ChatGPT
 * loading screen.
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR } = require("./patch-util");

const MARKER = "codex-rebuild:isolated-userdata-v1";
const SUPPORTED_PLATFORM = "mac-x64";

const USERDATA_FROM =
  "function ee({appDataPath:e,buildFlavor:n,env:r}){let i=r.CODEX_ELECTRON_USER_DATA_PATH?.trim();if(i)return(0,o.resolve)(i);let a=(0,o.join)(e,t.Na(n)),s=r.CODEX_ELECTRON_AGENT_RUN_ID?.trim()||null;return n===`agent`&&s!=null?(0,o.join)(a,`agent`,s):a}";
const USERDATA_TO =
  `function ee({appDataPath:e,buildFlavor:n,env:r}){/* ${MARKER} */let i=r.CODEX_ELECTRON_USER_DATA_PATH?.trim();if(i)return(0,o.resolve)(i);let a=(0,o.join)(e,\`CodexDesktop-Rebuild\`,\`Profile\`),s=r.CODEX_ELECTRON_AGENT_RUN_ID?.trim()||null;return n===\`agent\`&&s!=null?(0,o.join)(a,\`agent\`,s):a}`;

function findBootstrap(platform) {
  const buildDir = path.join(SRC_DIR, platform, "_asar", ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    throw new Error(`${platform}: missing .vite/build`);
  }
  const matches = fs
    .readdirSync(buildDir)
    .filter((name) => name.startsWith("bootstrap-") && name.endsWith(".js"))
    .map((name) => path.join(buildDir, name))
    .filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return source.includes("CODEX_ELECTRON_USER_DATA_PATH") && source.includes("function ee(");
    });
  if (matches.length !== 1) {
    throw new Error(`${platform}: expected one bootstrap with ee(), found ${matches.length}`);
  }
  return matches[0];
}

function patchFile(filePath, checkOnly) {
  let source = fs.readFileSync(filePath, "utf8");
  if (source.includes(MARKER) && source.includes(USERDATA_TO)) {
    console.log(`    [ok] ${relPath(filePath)} already isolates userData`);
    return false;
  }
  if (!source.includes(USERDATA_FROM) && !source.includes(USERDATA_TO)) {
    throw new Error(`${relPath(filePath)} missing expected ee() userData helper`);
  }
  if (checkOnly) {
    console.log(`    [?] ${relPath(filePath)} would isolate userData`);
    return true;
  }
  if (source.includes(USERDATA_FROM)) {
    source = source.split(USERDATA_FROM).join(USERDATA_TO);
  }
  if (!source.includes(MARKER)) {
    throw new Error(`${relPath(filePath)} failed to install isolated userData patch`);
  }
  fs.writeFileSync(filePath, source);
  console.log(`    [ok] ${relPath(filePath)} isolates userData under CodexDesktop-Rebuild/Profile`);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const platform = args.find((arg) => ["mac-x64", "mac-arm64"].includes(arg)) ?? SUPPORTED_PLATFORM;
  if (platform !== SUPPORTED_PLATFORM) {
    throw new Error(`isolated userData patch supports only ${SUPPORTED_PLATFORM}`);
  }
  const filePath = findBootstrap(platform);
  console.log(`  [${platform}] ${relPath(filePath)}`);
  patchFile(filePath, checkOnly);
}

if (require.main === module) main();

module.exports = { MARKER, USERDATA_FROM, USERDATA_TO, findBootstrap, patchFile };
