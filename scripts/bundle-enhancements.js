#!/usr/bin/env node
/**
 * bundle-enhancements.js — Layer enhancements from enhancements/manifest.json
 * into a Codex runtime app.
 *
 * Staging layout (inside the runtime app):
 *   Contents/Resources/enhancements/
 *     manifest.json          effective manifest (resolved versions + hashes)
 *     <id>/                  one directory per enhancement
 *       node_modules/...     installed package tree (npm: sources + dependencies)
 *       source/...           repository contents (github: tarball sources)
 *       <asset>.app|...      extracted release assets (github: asset sources)
 *
 * Enhancement types:
 *   service — started/stopped by the launcher around Codex (startCommand)
 *   tool    — staged for the user to invoke (toolCommand, optional)
 *
 * Sources:
 *   npm:<spec>                    npm package (installed at the enhancement root)
 *   github:<owner>/<repo>@<tag>   repo tarball (extracted to source/); when
 *                                 "asset" is set: a named release asset
 *                                 (extracted at the enhancement root, sha256
 *                                 verified against the manifest).
 *
 * The launcher reads Contents/Resources/enhancements/manifest.json from the
 * installed runtime and starts/stops each `service` enhancement around Codex.
 *
 * Usage:
 *   node scripts/bundle-enhancements.js --runtime <Codex.app> [--plan] [--platform mac-x64]
 *   node scripts/bundle-enhancements.js --plan          # default runtime out/mac-x64/Codex.app
 *
 * Fail-closed: any missing source, unsupported type, or failed verification
 * aborts the build. A silently-skipped enhancement is a release bug.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SOURCE_MANIFEST = path.join(PROJECT_ROOT, "enhancements", "manifest.json");
const DEFAULT_RUNTIME = path.join(PROJECT_ROOT, "out", "mac-x64", "Codex.app");
const ENHANCEMENTS_REL = path.join("Contents", "Resources", "enhancements");

const SUPPORTED_TYPES = new Set(["service", "tool"]);
const SUPPORTED_PLATFORMS = new Set(["mac-x64"]);

// ─── Helpers ────────────────────────────────────────────────────

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyRecursive(s, d);
    } else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(s);
      try {
        fs.symlinkSync(target, d);
      } catch {}
      count += 1;
    } else {
      fs.copyFileSync(s, d);
      // copyFileSync does not preserve the source mode; keep exec bits
      // (npm platform binaries like ccusage's ship without +x).
      fs.chmodSync(d, fs.statSync(s).mode & 0o7777);
      count += 1;
    }
  }
  return count;
}

function clearDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function machOArchitectures(binaryPath) {
  try {
    const output = execFileSync("/usr/bin/lipo", ["-archs", binaryPath], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output.split(/\s+/).filter(Boolean);
  } catch {
    return null; // not a Mach-O binary (script, etc.)
  }
}

async function downloadFile(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return buffer.length;
}

function extractTarGz(archive, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync("/usr/bin/tar", ["-xzf", archive, "-C", destDir], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function extractZip(archive, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync("/usr/bin/ditto", ["-x", "-k", archive, destDir], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// ─── Manifest validation ────────────────────────────────────────

function loadSourceManifest() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, "utf-8"));
  } catch (error) {
    throw new Error(`Cannot read enhancement manifest ${SOURCE_MANIFEST}: ${error.message}`);
  }
  if (manifest.version !== 1) {
    throw new Error(`Unsupported enhancement manifest version ${manifest.version}; expected 1`);
  }
  if (!Array.isArray(manifest.enhancements) || manifest.enhancements.length === 0) {
    throw new Error("Enhancement manifest declares no enhancements");
  }
  const ids = new Set();
  for (const enhancement of manifest.enhancements) {
    if (!enhancement.id || typeof enhancement.id !== "string") {
      throw new Error("Enhancement is missing a string id");
    }
    if (ids.has(enhancement.id)) throw new Error(`Duplicate enhancement id ${enhancement.id}`);
    ids.add(enhancement.id);
    if (!SUPPORTED_TYPES.has(enhancement.type)) {
      throw new Error(`Enhancement ${enhancement.id} has unsupported type ${enhancement.type}; supported: ${[...SUPPORTED_TYPES].join(", ")}`);
    }
    if (typeof enhancement.source !== "string" ||
        !(enhancement.source.startsWith("npm:") || enhancement.source.startsWith("github:"))) {
      throw new Error(`Enhancement ${enhancement.id} must use an npm: or github: source (got ${enhancement.source})`);
    }
    if (enhancement.source.startsWith("github:") && enhancement.asset &&
        typeof enhancement.sha256 !== "string") {
      throw new Error(`Enhancement ${enhancement.id} uses a release asset without a pinned sha256`);
    }
    if (enhancement.type === "service") {
      if (!Array.isArray(enhancement.startCommand) || enhancement.startCommand.length === 0) {
        throw new Error(`Service enhancement ${enhancement.id} is missing startCommand`);
      }
      if (enhancement.config && typeof enhancement.config.port !== "undefined" &&
          (!Number.isInteger(enhancement.config.port) || enhancement.config.port <= 0)) {
        throw new Error(`Enhancement ${enhancement.id} has an invalid config.port`);
      }
    }
    if (enhancement.dependencies &&
        (!Array.isArray(enhancement.dependencies) ||
         enhancement.dependencies.some((d) => typeof d !== "string" || !d.startsWith("npm:")))) {
      throw new Error(`Enhancement ${enhancement.id} dependencies must be npm: specs`);
    }
    if (enhancement.verify &&
        (!Array.isArray(enhancement.verify) ||
         enhancement.verify.some((v) => typeof v !== "string"))) {
      throw new Error(`Enhancement ${enhancement.id} verify must be a string array`);
    }
  }
  return manifest;
}

function parseNpmSpec(spec) {
  const match = spec.match(/^(@[^@]+|[^@]+)(?:@(.+))?$/);
  if (!match) throw new Error(`Cannot parse npm spec ${spec}`);
  return { name: match[1], version: match[2] || null };
}

// ─── Staging ────────────────────────────────────────────────────

function installNpmPackages(specs, stagingDir, planOnly) {
  const command = ["npm", "install", "--prefix", stagingDir, ...specs, "--no-audit", "--no-fund"];
  if (planOnly) return command;
  execFileSync("npm", ["install", "--prefix", stagingDir, ...specs, "--no-audit", "--no-fund"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
  return command;
}

function resolveInstalledVersion(stagingDir, spec) {
  const { name } = parseNpmSpec(spec);
  const pkgPath = path.join(stagingDir, "node_modules", name, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`npm install of ${spec} did not produce ${pkgPath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  return pkg.version || "unknown";
}

function parseGithubSpec(spec) {
  const match = spec.match(/^github:([^@]+)@(.+)$/);
  if (!match) throw new Error(`Cannot parse github spec ${spec} (expected github:owner/repo@tag)`);
  return { repo: match[1], tag: match[2] };
}

async function stageGithubSource(enhancement, stagingDir, planOnly) {
  const { repo, tag } = parseGithubSpec(enhancement.source);
  if (enhancement.asset) {
    // Release asset mode: download the named asset, verify sha256, extract at root.
    const url = `https://github.com/${repo}/releases/download/${tag}/${enhancement.asset}`;
    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-enhancement-asset-"));
    try {
      const archivePath = path.join(downloadDir, enhancement.asset);
      if (!planOnly) {
        await downloadFile(url, archivePath);
        const actual = sha256File(archivePath);
        if (actual !== enhancement.sha256) {
          throw new Error(`Enhancement ${enhancement.id} asset sha256 mismatch: expected ${enhancement.sha256}, got ${actual}`);
        }
        const kind = enhancement.asset.endsWith(".zip") ? "zip" : "tar.gz";
        if (kind === "zip") extractZip(archivePath, stagingDir);
        else extractTarGz(archivePath, stagingDir);
      }
      return { url, mode: "asset", tag };
    } finally {
      fs.rmSync(downloadDir, { recursive: true, force: true });
    }
  }
  // Tarball mode: download the repo tarball, extract into source/.
  const url = `https://codeload.github.com/${repo}/tar.gz/refs/tags/${tag}`;
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-enhancement-repo-"));
  try {
    if (!planOnly) {
      const archivePath = path.join(downloadDir, "repo.tar.gz");
      await downloadFile(url, archivePath);
      const sourceDir = path.join(stagingDir, "source");
      clearDir(sourceDir);
      extractTarGz(archivePath, downloadDir);
      // codeload tarballs contain a single top-level folder
      const extracted = fs.readdirSync(downloadDir).filter((n) => n.endsWith(".tar.gz") === false);
      const top = extracted.find((n) => fs.statSync(path.join(downloadDir, n)).isDirectory());
      if (!top) throw new Error(`github tarball for ${enhancement.source} contained no directory`);
      copyRecursive(path.join(downloadDir, top), sourceDir);
    }
    return { url, mode: "tarball", tag };
  } finally {
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }
}

async function resolveSource(enhancement, stagingDir, planOnly) {
  const source = enhancement.source;
  if (source.startsWith("npm:")) {
    const spec = source.slice("npm:".length);
    const install = installNpmPackages([spec], stagingDir, planOnly);
    return { kind: "npm", spec, install, resolvedVersion: null };
  }
  const info = await stageGithubSource(enhancement, stagingDir, planOnly);
  return { kind: "github", install: null, ...info };
}

function verifyPaths(enhancement, enhancementDir, platform, paths) {
  const checks = [];
  for (const rel of paths) {
    const full = path.join(enhancementDir, rel);
    if (!fs.existsSync(full)) {
      throw new Error(`Enhancement ${enhancement.id}: verify path missing: ${rel}`);
    }
    checks.push(`exists: ${rel}`);
    const architectures = machOArchitectures(full);
    if (architectures) {
      const expected = platform === "mac-x64" ? "x86_64" : "arm64";
      if (!architectures.includes(expected)) {
        throw new Error(`Enhancement ${enhancement.id}: ${rel} arch ${architectures.join(",")} does not include ${expected}`);
      }
      checks.push(`arch: ${architectures.join(",")}`);
    }
  }
  return checks;
}

// ─── Main entry ─────────────────────────────────────────────────

async function bundleEnhancements(runtimeApp, { planOnly = false, platform = "mac-x64" } = {}) {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`bundle-enhancements does not yet support platform ${platform}`);
  }
  if (!planOnly && !fs.existsSync(runtimeApp)) {
    throw new Error(`Runtime app not found: ${runtimeApp}`);
  }

  const manifest = loadSourceManifest();
  const enhancementsDir = path.join(runtimeApp, ENHANCEMENTS_REL);
  const plan = {
    manifest: SOURCE_MANIFEST,
    platform,
    runtime: runtimeApp,
    actions: [],
  };

  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-enhancements-"));
  const effective = { version: 1, platform, enhancements: [] };

  try {
    for (const enhancement of manifest.enhancements) {
      const stagingDir = path.join(stagingRoot, enhancement.id);
      const action = {
        enhancement: enhancement.id,
        type: enhancement.type,
        source: enhancement.source,
        stageTo: path.join(enhancementsDir, enhancement.id),
      };
      plan.actions.push(action);
      if (planOnly) continue;

      const resolved = await resolveSource(enhancement, stagingDir, planOnly);
      action.resolved = resolved.install || resolved.url;

      if (enhancement.dependencies && enhancement.dependencies.length > 0) {
        const specs = enhancement.dependencies.map((d) => d.slice("npm:".length));
        action.dependencies = installNpmPackages(specs, stagingDir, planOnly);
      }

      const enhancementDir = path.join(enhancementsDir, enhancement.id);
      clearDir(enhancementDir);
      const copied = copyRecursive(stagingDir, enhancementDir);
      action.copiedFiles = copied;

      // Declared executables (service start binaries and verify entries) must
      // be runnable. npm platform packages sometimes ship without +x.
      const declaredExecutables = [];
      if (enhancement.type === "service") declaredExecutables.push(enhancement.startCommand[0]);
      if (enhancement.verify) declaredExecutables.push(...enhancement.verify);
      for (const rel of declaredExecutables) {
        const full = path.join(enhancementDir, rel);
        if (fs.existsSync(full)) fs.chmodSync(full, 0o755);
      }

      const checks = [];
      if (enhancement.type === "service") {
        const binaryRel = enhancement.startCommand[0];
        const binaryPath = path.join(enhancementDir, binaryRel);
        if (!fs.existsSync(binaryPath)) {
          throw new Error(`Enhancement ${enhancement.id}: startCommand binary missing at ${binaryRel}`);
        }
        checks.push(`binary exists: ${binaryRel}`);
        let executable = true;
        try {
          fs.accessSync(binaryPath, fs.constants.X_OK);
        } catch {
          executable = false;
        }
        if (!executable) {
          throw new Error(`Enhancement ${enhancement.id}: startCommand binary is not executable: ${binaryRel}`);
        }
        checks.push("binary is executable");
        const architectures = machOArchitectures(binaryPath);
        if (architectures) {
          const expected = platform === "mac-x64" ? "x86_64" : "arm64";
          if (!architectures.includes(expected)) {
            throw new Error(`Enhancement ${enhancement.id}: startCommand binary arch ${architectures.join(",")} does not include ${expected}`);
          }
          checks.push(`binary arch: ${architectures.join(",")}`);
        } else {
          checks.push("binary is not Mach-O (script); arch check skipped");
        }
      }
      if (enhancement.verify) {
        checks.push(...verifyPaths(enhancement, enhancementDir, platform, enhancement.verify));
      }
      action.checks = checks;

      let resolvedVersion = null;
      if (resolved.kind === "npm") {
        resolvedVersion = resolveInstalledVersion(stagingDir, resolved.spec);
      } else {
        resolvedVersion = resolved.tag;
      }

      const entry = {
        id: enhancement.id,
        type: enhancement.type,
        source: enhancement.source,
        resolvedVersion,
        description: enhancement.description || undefined,
        config: enhancement.config || {},
      };
      if (enhancement.type === "service") {
        entry.lifecycle = enhancement.lifecycle || "launcher";
        entry.startCommand = enhancement.startCommand;
        const binaryRel = enhancement.startCommand[0];
        entry.startBinarySha256 = sha256File(path.join(enhancementDir, binaryRel));
      }
      if (enhancement.toolCommand) entry.toolCommand = enhancement.toolCommand;
      if (enhancement.ui) entry.ui = enhancement.ui;
      if (enhancement.asset) {
        entry.asset = enhancement.asset;
        // Verified against the download during staging; record for provenance.
        entry.assetSha256 = enhancement.sha256;
      }
      effective.enhancements.push(entry);
      console.log(`   [bundle] ${enhancement.id} v${resolvedVersion} (${copied} files, ${checks.length} checks)`);
    }

    if (!planOnly) {
      fs.writeFileSync(
        path.join(enhancementsDir, "manifest.json"),
        JSON.stringify(effective, null, 2) + "\n",
      );
      console.log(`   [bundle] wrote ${path.join(enhancementsDir, "manifest.json")}`);
    }
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }

  return plan;
}

// ─── CLI ────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const planOnly = args.includes("--plan");
  const runtimeIndex = args.indexOf("--runtime");
  const runtimeApp = runtimeIndex >= 0 && args[runtimeIndex + 1]
    ? path.resolve(args[runtimeIndex + 1])
    : DEFAULT_RUNTIME;
  const platformIndex = args.indexOf("--platform");
  const platform = platformIndex >= 0 && args[platformIndex + 1]
    ? args[platformIndex + 1]
    : "mac-x64";

  console.log(`\n== Bundle enhancements${planOnly ? " (plan)" : ""} ==`);
  bundleEnhancements(runtimeApp, { planOnly, platform }).then((plan) => {
    if (planOnly) {
      console.log(JSON.stringify(plan, null, 2));
      console.log("\n== Plan only; nothing was staged ==");
      return;
    }
    console.log(`\n== Enhancements bundled into ${runtimeApp} ==`);
  }).catch((error) => {
    console.error(`\n[x] ${error.message}`);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}

module.exports = { bundleEnhancements, loadSourceManifest };