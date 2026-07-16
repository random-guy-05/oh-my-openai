#!/usr/bin/env node
/**
 * Give the side-by-side build its own deep-link protocol.
 *
 * The official app owns codex://. A second app must not register that same
 * protocol or emit URLs that macOS routes back to the official app.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { relPath, SRC_DIR } = require("./patch-util");

const MARKER = "codex-rebuild:side-by-side-scheme";
const ORIGINAL_URL = "codex://";
const UNIQUE_URL = "codex-rebuild://";
const TICK = String.fromCharCode(96);
const ORIGINAL_PROTOCOL_LITERAL = TICK + "codex:" + TICK;
const UNIQUE_PROTOCOL_LITERAL = TICK + "codex-rebuild:" + TICK;
const ORIGINAL_REGISTRATION = ".setAsDefaultProtocolClient(" + TICK + "codex" + TICK + ")";
const RUNTIME_REGISTRATION =
  ".setAsDefaultProtocolClient(" + TICK + "codex-rebuild" + TICK + ")";
const LAUNCHER_OWNS_REGISTRATION =
  "!=null/* codex-rebuild:launcher-owns-protocol */";
const BROKEN_LAUNCHER_REGISTRATION =
  ".!0/* codex-rebuild:launcher-owns-protocol */";
const ORIGINAL_SINGLE_INSTANCE = "return t?!e:!1";
const UNIQUE_SINGLE_INSTANCE = "return t/* codex-rebuild:force-single-instance */";
const MAC_PLATFORMS = ["mac-arm64", "mac-x64"];
const RENDERER_PREFIXES = [
  "header-",
  "app-initial~app-main~quick-chat-window-page~chatgpt-conversation-page-",
];

function occurrences(source, value) {
  return source.split(value).length - 1;
}

function exactlyOneFile(directory, predicate, label) {
  const matches = fs.readdirSync(directory)
    .filter(predicate)
    .map((name) => path.join(directory, name));
  if (matches.length !== 1) {
    throw new Error(label + ": expected exactly one file, found " + matches.length);
  }
  return matches[0];
}

function targetFiles(platform) {
  const root = path.join(SRC_DIR, platform, "_asar");
  const buildDirectory = path.join(root, ".vite", "build");
  const assetsDirectory = path.join(root, "webview", "assets");
  if (!fs.existsSync(root)) return null;

  const build = fs.readdirSync(buildDirectory)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => {
      const source = fs.readFileSync(path.join(buildDirectory, name), "utf8");
      return source.includes(ORIGINAL_URL) || source.includes(UNIQUE_URL) ||
        source.includes(ORIGINAL_PROTOCOL_LITERAL) ||
        source.includes(UNIQUE_PROTOCOL_LITERAL);
    })
    .sort()
    .map((name) => path.join(buildDirectory, name));
  if (build.length !== 5) {
    throw new Error(platform + " build bundles: expected 5 protocol files, found " + build.length);
  }
  const renderer = RENDERER_PREFIXES.map((prefix) => exactlyOneFile(
    assetsDirectory,
    (name) => {
      if (!name.startsWith(prefix) || !name.endsWith(".js")) return false;
      const source = fs.readFileSync(path.join(assetsDirectory, name), "utf8");
      return source.includes(ORIGINAL_URL) || source.includes(UNIQUE_URL);
    },
    platform + " renderer bundle " + prefix,
  ));
  return { build, renderer };
}

function verifyInstalled(files) {
  const buildSources = files.build.map((file) => fs.readFileSync(file, "utf8"));
  const combinedBuild = buildSources.join("\n");
  const rendererSources = files.renderer.map((file) => fs.readFileSync(file, "utf8"));
  const combinedRenderer = rendererSources.join("\n");

  for (let index = 0; index < files.build.length; index += 1) {
    new vm.Script(buildSources[index], { filename: relPath(files.build[index]) });
  }

  if (!buildSources.some((source) => source.includes(MARKER))) {
    throw new Error(relPath(files.build[0]) + " is missing " + MARKER);
  }
  if (occurrences(combinedBuild, ORIGINAL_URL) !== 0 ||
      occurrences(combinedRenderer, ORIGINAL_URL) !== 0) {
    throw new Error("The original codex:// protocol remains in patched bundles");
  }
  if (occurrences(combinedBuild, UNIQUE_URL) !== 8 ||
      occurrences(combinedRenderer, UNIQUE_URL) !== 6) {
    throw new Error("Unexpected codex-rebuild:// deep-link structure");
  }
  if (occurrences(combinedBuild, ORIGINAL_PROTOCOL_LITERAL) !== 0 ||
      occurrences(combinedBuild, UNIQUE_PROTOCOL_LITERAL) !== 4 ||
      occurrences(combinedBuild, ORIGINAL_REGISTRATION) !== 0 ||
      occurrences(combinedBuild, RUNTIME_REGISTRATION) !== 0 ||
      occurrences(combinedBuild, LAUNCHER_OWNS_REGISTRATION) !== 1 ||
      occurrences(combinedBuild, BROKEN_LAUNCHER_REGISTRATION) !== 0 ||
      occurrences(combinedBuild, ORIGINAL_SINGLE_INSTANCE) !== 0 ||
      occurrences(combinedBuild, UNIQUE_SINGLE_INSTANCE) !== 1) {
    throw new Error("Unexpected main-process protocol registration structure");
  }
}

function patchPlatform(platform, checkOnly) {
  const files = targetFiles(platform);
  if (!files) {
    console.log("[skip] " + platform + ": source not found");
    return;
  }

  const originalBuildSources = files.build.map((file) => fs.readFileSync(file, "utf8"));
  const combinedBuild = originalBuildSources.join("\n");
  const alreadyMarked = combinedBuild.includes(MARKER);
  if (alreadyMarked) {
    try {
      verifyInstalled(files);
      console.log("[ok] " + platform + ": unique deep-link scheme already installed");
      return;
    } catch (error) {
      if (checkOnly) throw error;
    }
  }
  if (checkOnly) {
    throw new Error(platform + ": unique deep-link scheme is not installed");
  }

  const rendererSources = files.renderer.map((file) => fs.readFileSync(file, "utf8"));
  const combinedRenderer = rendererSources.join("\n");
  const structure = {
    buildUrls: occurrences(combinedBuild, ORIGINAL_URL),
    uniqueBuildUrls: occurrences(combinedBuild, UNIQUE_URL),
    rendererUrls: occurrences(combinedRenderer, ORIGINAL_URL),
    uniqueRendererUrls: occurrences(combinedRenderer, UNIQUE_URL),
    protocolLiterals: occurrences(combinedBuild, ORIGINAL_PROTOCOL_LITERAL),
    uniqueProtocolLiterals: occurrences(combinedBuild, UNIQUE_PROTOCOL_LITERAL),
    registrations: occurrences(combinedBuild, ORIGINAL_REGISTRATION),
    runtimeRegistrations: occurrences(combinedBuild, RUNTIME_REGISTRATION),
    launcherRegistrations: occurrences(combinedBuild, LAUNCHER_OWNS_REGISTRATION),
    brokenLauncherRegistrations: occurrences(combinedBuild, BROKEN_LAUNCHER_REGISTRATION),
    singleInstancePredicates: occurrences(combinedBuild, ORIGINAL_SINGLE_INSTANCE),
    uniqueSingleInstancePredicates: occurrences(combinedBuild, UNIQUE_SINGLE_INSTANCE),
  };
  const freshStructure = structure.buildUrls === 8 && structure.uniqueBuildUrls === 0 &&
    structure.rendererUrls === 6 && structure.uniqueRendererUrls === 0 &&
    structure.protocolLiterals === 4 && structure.uniqueProtocolLiterals === 0 &&
    structure.registrations === 1 && structure.runtimeRegistrations === 0 &&
    structure.launcherRegistrations === 0 && structure.brokenLauncherRegistrations === 0 &&
    structure.singleInstancePredicates === 1 &&
    structure.uniqueSingleInstancePredicates === 0;
  const upgradeStructure = alreadyMarked && structure.buildUrls === 0 &&
    structure.uniqueBuildUrls === 8 && structure.rendererUrls === 0 &&
    structure.uniqueRendererUrls === 6 &&
    structure.protocolLiterals + structure.uniqueProtocolLiterals === 4 &&
    structure.registrations === 0 &&
    structure.runtimeRegistrations + structure.launcherRegistrations +
      structure.brokenLauncherRegistrations === 1 &&
    structure.singleInstancePredicates + structure.uniqueSingleInstancePredicates === 1;
  if (!freshStructure && !upgradeStructure) {
    throw new Error(platform + ": upstream deep-link structure changed: " +
      JSON.stringify(structure));
  }

  files.build.forEach((file, index) => {
    let nextSource = originalBuildSources[index].replaceAll(ORIGINAL_URL, UNIQUE_URL);
    nextSource = nextSource.replaceAll(ORIGINAL_PROTOCOL_LITERAL, UNIQUE_PROTOCOL_LITERAL);
    nextSource = nextSource.replace(ORIGINAL_REGISTRATION, LAUNCHER_OWNS_REGISTRATION);
    nextSource = nextSource.replace(RUNTIME_REGISTRATION, LAUNCHER_OWNS_REGISTRATION);
    nextSource = nextSource.replace(BROKEN_LAUNCHER_REGISTRATION, LAUNCHER_OWNS_REGISTRATION);
    nextSource = nextSource.replace(ORIGINAL_SINGLE_INSTANCE, UNIQUE_SINGLE_INSTANCE);
    if (index === 0 && !alreadyMarked) nextSource = "/* " + MARKER + " */" + nextSource;
    fs.writeFileSync(file, nextSource);
  });

  files.renderer.forEach((file, index) => {
    fs.writeFileSync(file, rendererSources[index].replaceAll(ORIGINAL_URL, UNIQUE_URL));
  });

  verifyInstalled(files);
  console.log("[ok] " + platform + ": installed codex-rebuild:// deep-link scheme");
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const requested = args.find((argument) =>
    [...MAC_PLATFORMS, "unix", "win"].includes(argument));
  if (requested === "win") {
    console.log("[skip] win: side-by-side protocol patch is macOS-only");
    return;
  }

  const platforms = requested && requested !== "unix" ? [requested] : MAC_PLATFORMS;
  let failures = 0;
  for (const platform of platforms) {
    try {
      patchPlatform(platform, checkOnly);
    } catch (error) {
      console.error("[x] " + platform + ": " + error.message);
      failures += 1;
    }
  }
  if (failures > 0) process.exit(1);
}

main();
