#!/usr/bin/env node
/**
 * Check that operational release metadata agrees across package.json, the
 * Homebrew Cask, README, and the latest release-notes heading.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, filePath), "utf8");
}

function collectMetadata(root = PROJECT_ROOT) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const cask = fs.readFileSync(path.join(root, "Casks", "codex-desktop.rb"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const releaseNotes = fs.readFileSync(path.join(root, "RELEASE_NOTES.md"), "utf8");
  const sha256sums = fs.readFileSync(path.join(root, "SHA256SUMS"), "utf8");

  const caskVersion = cask.match(/^\s*version\s+"([^"]+)"/m)?.[1] || null;
  const readmeVersion = readme.match(/^## Current build \(([^)]+)\)/m)?.[1] || null;
  const releaseVersion = releaseNotes.match(/^# Codex Intel ([^ —]+)(?: —|$)/m)?.[1] || null;
  const packageVersion = packageJson.version || null;
  const lockVersion = packageLock.packages?.[""].version || packageLock.version || null;
  const caskSha256 = cask.match(/^\s*sha256\s+"([a-f0-9]{64})"/m)?.[1] || null;
  const artifactName = packageVersion ? `Codex-side-by-side-mac-x64-${packageVersion}.dmg` : null;
  const artifactSha256 = artifactName
    ? sha256sums
      .split(/\r?\n/)
      .map(line => line.trim().split(/\s+/, 2))
      .find(([, name]) => name === artifactName)?.[0] || null
    : null;

  const errors = [];
  const warnings = [];
  if (!packageVersion) errors.push("package.json is missing a version");
  if (!lockVersion) errors.push("package-lock.json is missing a root version");
  if (!caskVersion) errors.push("Cask is missing a version");
  if (!cask.includes("releases/download/v#{version}/Codex-side-by-side-mac-x64-#{version}.dmg")) {
    errors.push("Cask URL does not match the automated v<version> release layout");
  }
  if (packageVersion && caskVersion && packageVersion !== caskVersion) {
    errors.push(`package.json version ${packageVersion} differs from Cask version ${caskVersion}`);
  }
  if (packageVersion && lockVersion && packageVersion !== lockVersion) {
    errors.push(`package.json version ${packageVersion} differs from package-lock.json ${lockVersion}`);
  }
  if (packageVersion && !artifactSha256) {
    errors.push(`SHA256SUMS is missing ${artifactName}`);
  }
  if (caskSha256 && artifactSha256 && caskSha256 !== artifactSha256) {
    errors.push(`Cask sha256 ${caskSha256} differs from SHA256SUMS ${artifactSha256}`);
  }
  if (readmeVersion && packageVersion && readmeVersion !== packageVersion) {
    warnings.push(`README current build ${readmeVersion} differs from package.json ${packageVersion}`);
  }
  if (releaseVersion && packageVersion && releaseVersion !== packageVersion) {
    warnings.push(`latest release notes ${releaseVersion} differs from package.json ${packageVersion}`);
  }

  return {
    packageVersion,
    lockVersion,
    caskVersion,
    caskSha256,
    artifactName,
    artifactSha256,
    readmeVersion,
    releaseVersion,
    errors,
    warnings,
  };
}

function main() {
  const strict = process.argv.includes("--strict");
  const json = process.argv.includes("--json");
  const result = collectMetadata();
  const failures = strict ? result.errors.concat(result.warnings) : result.errors;

  if (json) {
    console.log(JSON.stringify({ ...result, strict, failures }, null, 2));
  } else {
    console.log(`[ok] operational version: ${result.packageVersion || "unknown"}`);
    for (const warning of result.warnings) console.warn(`[warn] ${warning}`);
    for (const error of result.errors) console.error(`[x] ${error}`);
    if (strict && result.warnings.length > 0) console.error("[x] strict mode treats metadata warnings as release failures");
  }
  process.exitCode = failures.length > 0 ? 1 : 0;
}

if (require.main === module) main();

module.exports = { collectMetadata, read };
