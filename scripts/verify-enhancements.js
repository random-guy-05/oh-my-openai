#!/usr/bin/env node
/**
 * Validate the enhancement contract before a release.
 *
 * With no arguments this validates the checked-in source manifest. Pass
 * --app <Codex.app> to validate the effective manifest and staged files in a
 * built application as well.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SOURCE_MANIFEST = path.join(PROJECT_ROOT, "enhancements", "manifest.json");
const ENHANCEMENTS_REL = path.join("Contents", "Resources", "enhancements");
const VALID_TYPES = new Set(["service", "tool"]);
const VALID_UI_KINDS = new Set(["web", "app", "terminal", "tool"]);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertString(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string`);
}

function assertSafeRelative(value, label) {
  assertString(value, label);
  assert(!path.isAbsolute(value), `${label} must be relative: ${value}`);
  const normalized = path.posix.normalize(value.replaceAll(path.sep, "/"));
  assert(normalized !== ".." && !normalized.startsWith("../"), `${label} escapes its enhancement directory: ${value}`);
}

function validateCommand(command, label) {
  assert(Array.isArray(command) && command.length > 0, `${label} must be a non-empty command array`);
  command.forEach((part, index) => assertString(part, `${label}[${index}]`));
  if (command[0].includes("/")) assertSafeRelative(command[0], `${label}[0]`);
}

function validateManifest(manifest, label = "manifest") {
  assert(manifest && typeof manifest === "object", `${label} must be an object`);
  assert(manifest.version === 1, `${label} has unsupported version ${manifest.version}; expected 1`);
  const platformList = Array.isArray(manifest.platforms)
    ? manifest.platforms
    : manifest.platform
      ? [manifest.platform]
      : [];
  platformList.forEach((platform) => assertString(platform, `${label}.platform`));
  assert(Array.isArray(manifest.enhancements) && manifest.enhancements.length > 0,
    `${label}.enhancements must contain at least one entry`);

  const ids = new Set();
  for (const enhancement of manifest.enhancements) {
    assert(enhancement && typeof enhancement === "object", `${label} contains a malformed enhancement`);
    assertString(enhancement.id, `${label} enhancement id`);
    assert(/^[a-z0-9][a-z0-9-]*$/.test(enhancement.id), `Invalid enhancement id ${enhancement.id}`);
    assert(!ids.has(enhancement.id), `Duplicate enhancement id ${enhancement.id}`);
    ids.add(enhancement.id);

    assert(VALID_TYPES.has(enhancement.type),
      `Enhancement ${enhancement.id} has unsupported type ${enhancement.type}`);
    assertString(enhancement.source, `Enhancement ${enhancement.id} source`);
    assert(enhancement.source.startsWith("npm:") || enhancement.source.startsWith("github:"),
      `Enhancement ${enhancement.id} source must use npm: or github:`);

    if (enhancement.type === "service") validateCommand(enhancement.startCommand, `${enhancement.id}.startCommand`);
    if (enhancement.toolCommand) validateCommand(enhancement.toolCommand, `${enhancement.id}.toolCommand`);
    if (enhancement.type === "tool") {
      assert(enhancement.toolCommand || enhancement.appPath,
        `Tool enhancement ${enhancement.id} is missing toolCommand or appPath`);
    }

    if (enhancement.appPath) {
      assertSafeRelative(enhancement.appPath, `${enhancement.id}.appPath`);
      assert(enhancement.ui?.kind === "app",
        `App-backed enhancement ${enhancement.id} must use ui.kind app`);
    }

    if (enhancement.overlay) {
      assertSafeRelative(enhancement.overlay, `${enhancement.id}.overlay`);
    }

    if (enhancement.asset) {
      assertString(enhancement.asset, `${enhancement.id}.asset`);
      assert(/\.(?:dmg|zip|tar\.gz)$/.test(enhancement.asset),
        `${enhancement.id}.asset must be a .dmg, .zip, or .tar.gz archive`);
      const digest = enhancement.sha256 || enhancement.assetSha256;
      assert(/^[a-f0-9]{64}$/.test(digest || ""),
        `${enhancement.id} asset digest must be a 64-character lowercase SHA-256 digest`);
    }

    if (enhancement.dependencies) {
      assert(Array.isArray(enhancement.dependencies), `${enhancement.id}.dependencies must be an array`);
      enhancement.dependencies.forEach((dependency) => {
        assertString(dependency, `${enhancement.id}.dependencies entry`);
        assert(dependency.startsWith("npm:"), `${enhancement.id} dependencies must use npm:`);
      });
    }

    if (enhancement.verify) {
      assert(Array.isArray(enhancement.verify), `${enhancement.id}.verify must be an array`);
      enhancement.verify.forEach((entry) => assertSafeRelative(entry, `${enhancement.id}.verify entry`));
    }

    if (enhancement.ui) {
      assert(typeof enhancement.ui === "object", `${enhancement.id}.ui must be an object`);
      assertString(enhancement.ui.label, `${enhancement.id}.ui.label`);
      assertString(enhancement.ui.openLabel, `${enhancement.id}.ui.openLabel`);
      assert(VALID_UI_KINDS.has(enhancement.ui.kind),
        `${enhancement.id}.ui.kind must be one of ${[...VALID_UI_KINDS].join(", ")}`);
      if (enhancement.ui.kind === "web") {
        assertString(enhancement.ui.url, `${enhancement.id}.ui.url`);
        assert(/^https?:\/\//.test(enhancement.ui.url), `${enhancement.id}.ui.url must be http(s)`);
      }
    }
  }

  return { ids: [...ids], platforms: platformList };
}

function resolveCommand(enhancementDir, command) {
  const first = command && command[0];
  if (!first) return null;
  if (!first.includes("/")) return null;
  return path.resolve(enhancementDir, first);
}

function validateRuntimeApp(appPath) {
  assert(fs.existsSync(appPath), `Built app does not exist: ${appPath}`);
  const manifestPath = path.join(appPath, ENHANCEMENTS_REL, "manifest.json");
  const manifest = readJson(manifestPath);
  const summary = validateManifest(manifest, `built app manifest ${manifestPath}`);
  const enhancementsRoot = path.dirname(manifestPath);

  for (const enhancement of manifest.enhancements) {
    const enhancementDir = path.join(enhancementsRoot, enhancement.id);
    assert(fs.existsSync(enhancementDir),
      `Enhancement ${enhancement.id} directory is missing from the built app`);

    if (enhancement.appPath) {
      const appPath = path.join(enhancementDir, enhancement.appPath);
      assert(fs.existsSync(appPath) && fs.statSync(appPath).isDirectory(),
        `Enhancement ${enhancement.id} app bundle is missing: ${enhancement.appPath}`);
      assert(fs.existsSync(path.join(appPath, "Contents", "Info.plist")),
        `Enhancement ${enhancement.id} app bundle has no Info.plist`);
    }

    const commands = [];
    if (enhancement.startCommand) commands.push(["startCommand", enhancement.startCommand]);
    if (enhancement.toolCommand) commands.push(["toolCommand", enhancement.toolCommand]);
    for (const [kind, command] of commands) {
      const commandPath = resolveCommand(enhancementDir, command);
      if (!commandPath) continue;
      assert(fs.existsSync(commandPath),
        `Enhancement ${enhancement.id} ${kind} binary is missing: ${command[0]}`);
      assert(fs.statSync(commandPath).isFile(),
        `Enhancement ${enhancement.id} ${kind} target is not a file: ${command[0]}`);
      assert((fs.statSync(commandPath).mode & 0o111) !== 0,
        `Enhancement ${enhancement.id} ${kind} binary is not executable: ${command[0]}`);
    }

    for (const relativePath of enhancement.verify || []) {
      assert(fs.existsSync(path.join(enhancementDir, relativePath)),
        `Enhancement ${enhancement.id} verification path is missing: ${relativePath}`);
    }
  }

  return { ...summary, manifestPath, appPath };
}

function parseArgs(argv) {
  const args = { app: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--app") {
      args.app = argv[++index];
      if (!args.app) throw new Error("--app requires a .app path");
    } else if (argument === "--json") {
      args.json = true;
    } else if (argument === "--help" || argument === "-h") {
      console.log("Usage: node scripts/verify-enhancements.js [--app <Codex.app>] [--json]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${argument}`);
    }
  }
  return args;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const sourceManifest = readJson(SOURCE_MANIFEST);
    const source = validateManifest(sourceManifest, SOURCE_MANIFEST);
    const runtime = args.app ? validateRuntimeApp(path.resolve(args.app)) : null;
    const result = {
      source: { manifestPath: SOURCE_MANIFEST, ...source },
      runtime,
    };
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`[ok] source manifest: ${source.ids.length} enhancement(s), ${source.platforms.join(", ") || "platform unspecified"}`);
      if (runtime) console.log(`[ok] built app: ${runtime.appPath}`);
      else console.log("[info] no built app supplied; staged-file checks skipped");
    }
  } catch (error) {
    console.error(`[x] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { validateManifest, validateRuntimeApp };
