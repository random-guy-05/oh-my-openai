"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { validateManifest, validateRuntimeApp } = require("./verify-enhancements");

function manifest(overrides = {}) {
  return {
    version: 1,
    platforms: ["mac-x64"],
    enhancements: [{
      id: "example-tool",
      type: "tool",
      source: "npm:example-tool@1.0.0",
      toolCommand: ["bin/example"],
      verify: ["bin/example"],
      ui: { label: "Example", kind: "tool", openLabel: "Open" },
      ...overrides,
    }],
  };
}

test("accepts the checked-in enhancement contract shape", () => {
  const checkedIn = require("../enhancements/manifest.json");
  const result = validateManifest(checkedIn, "checked-in manifest");
  assert.deepEqual(result.ids, ["opencodex", "nerftrack", "codex-chatgpt-web"]);
  const web = checkedIn.enhancements.find((entry) => entry.id === "codex-chatgpt-web");
  assert.equal(web.ui.kind, "app");
  assert.equal(web.appPath, "Codex Web GPT.app");
  assert.notEqual(web.enabled, false);
  assert.equal(web.toolCommand, undefined);
});

test("accepts a native app enhancement contract", () => {
  const result = validateManifest({
    version: 1,
    platforms: ["mac-x64"],
    enhancements: [{
      id: "native-dashboard",
      type: "tool",
      source: "github:example/native-dashboard@v1.0.0",
      asset: "NativeDashboard-1.0.0-macos-x86_64.dmg",
      sha256: "a".repeat(64),
      appPath: "NativeDashboard.app",
      verify: ["NativeDashboard.app/Contents/Info.plist"],
      ui: { label: "Native Dashboard", kind: "app", openLabel: "Open Dashboard" },
    }],
  });
  assert.deepEqual(result.ids, ["native-dashboard"]);
});

test("rejects duplicate or unsafe enhancement identifiers", () => {
  assert.throws(() => validateManifest({
    version: 1,
    enhancements: [manifest().enhancements[0], manifest().enhancements[0]],
  }), /Duplicate enhancement id/);

  assert.throws(() => validateManifest(manifest({ id: "../escape" })), /Invalid enhancement id/);
});

test("validates staged command and verification paths in a built app", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-openai-test-"));
  const app = path.join(root, "Codex.app");
  const enhancementDir = path.join(app, "Contents/Resources/enhancements/example-tool");
  fs.mkdirSync(path.join(enhancementDir, "bin"), { recursive: true });
  const command = path.join(enhancementDir, "bin/example");
  fs.writeFileSync(command, "#!/bin/sh\n");
  fs.chmodSync(command, 0o755);
  fs.writeFileSync(path.join(app, "Contents/Resources/enhancements/manifest.json"),
    JSON.stringify(manifest()) + "\n");

  assert.equal(validateRuntimeApp(app).ids[0], "example-tool");

  fs.chmodSync(command, 0o644);
  assert.throws(() => validateRuntimeApp(app), /not executable/);
});

test("validates a staged native app enhancement", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-openai-app-test-"));
  const app = path.join(root, "Codex.app");
  const enhancementDir = path.join(app, "Contents/Resources/enhancements/example-tool");
  const nestedApp = path.join(enhancementDir, "Example.app/Contents");
  fs.mkdirSync(nestedApp, { recursive: true });
  fs.writeFileSync(path.join(nestedApp, "Info.plist"), "<?xml version=\"1.0\"?>\n");
  const appManifest = manifest({
    toolCommand: undefined,
    appPath: "Example.app",
    asset: "Example-1.0.0-macos-x86_64.dmg",
    sha256: "b".repeat(64),
    verify: ["Example.app/Contents/Info.plist"],
    ui: { label: "Example", kind: "app", openLabel: "Open Example" },
  });
  fs.writeFileSync(path.join(app, "Contents/Resources/enhancements/manifest.json"),
    JSON.stringify(appManifest) + "\n");

  assert.equal(validateRuntimeApp(app).ids[0], "example-tool");
});

test("packaged tray integration does not depend on developer-machine paths", () => {
  const buildScript = fs.readFileSync(path.join(__dirname, "build-side-by-side-mac.js"), "utf8");
  assert.doesNotMatch(buildScript, /\/Users\/admin\/oh-my-openai/);
  assert.match(buildScript, /codex-rebuild:\/\/enhancement/);
});

test("native launchers dispatch from manifest capabilities", () => {
  const hub = fs.readFileSync(path.join(__dirname, "..", "launcher", "EnhancementHub.swift"), "utf8");
  const launcher = fs.readFileSync(path.join(__dirname, "..", "launcher", "CodexLauncher.m"), "utf8");
  assert.match(hub, /enhancement\.kind == "web"/);
  assert.match(hub, /enhancement\.kind == "app"/);
  assert.match(hub, /enhancement\.kind == "terminal"/);
  assert.doesNotMatch(hub, /enhancement\.id == "(?:opencodex|codex-chatgpt-web)"/);
  assert.match(launcher, /\[kind isEqualToString:@"app"\]/);
  assert.match(launcher, /\[kind isEqualToString:@"terminal"\]/);
  assert.match(launcher, /ResolveEnhancementBinary\(enhDir, command\)/);
});
