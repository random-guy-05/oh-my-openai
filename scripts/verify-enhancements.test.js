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
  const services = checkedIn.enhancements.filter((entry) => entry.type === "service");
  assert.equal(web.type, "service");
  assert.equal(web.ui.kind, "web");
  assert.equal(web.ui.url, "http://127.0.0.1:17842");
  assert.equal(web.overlay, "assets/codex-chatgpt-web-dashboard");
  assert.equal(web.codexHome, "ChatGPTWebHome");
  assert.deepEqual(web.connectCommand, [
    "runtime/bun",
    "run",
    "login.js",
  ]);
  const opencodex = checkedIn.enhancements.find((entry) => entry.id === "opencodex");
  assert.deepEqual(opencodex.postStartCommand, [
    "node_modules/bun/bin/bun.exe",
    "run",
    "post-start.js",
  ]);
  assert.equal(web.ui.connectLabel, "Connect ChatGPT");
  assert.notEqual(web.enabled, false);
  assert.equal(web.toolCommand, undefined);
  assert.equal(web.appPath, undefined);
  assert.deepEqual(services.map((entry) => entry.id), ["opencodex", "codex-chatgpt-web"]);
  assert.deepEqual(services.map((entry) => entry.lifecycle), ["launcher", "launcher"]);
  assert.notEqual(services[0].config.port, services[1].config.port);
  assert.equal(opencodex.healthPath, "/healthz");
  assert.equal(opencodex.required, true);
  assert.equal(web.healthPath, "/healthz");
  assert.equal(web.readinessPath, "/api/status");
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
  assert.match(buildScript, /codex-rebuild:enhancements-tray-v1/);
  assert.match(buildScript, /enhancement tray already integrated/);
  assert.match(buildScript, /Connect ChatGPT/);
  assert.match(buildScript, /Connect to Codex ChatGPT Web/);
  assert.match(buildScript, /\/api\/connect/);
  assert.match(buildScript, /CODEX_REBUILD_ENHANCEMENTS_PATH/);
  assert.match(buildScript, /path\.resolve\(resourcesPath, '\.\.', '\.\.', '\.\.'/);
  assert.match(buildScript, /getNativeStatusItemState!=null/);
  assert.match(buildScript, /process\.platform===`darwin`&&e\.getNativeStatusItemState!=null/);
  assert.match(buildScript, /native macOS status-item addon only understands/);
  assert.match(buildScript, /useEmbeddedElectronTray = true/);
  assert.match(buildScript, /disabled upstream Quit ChatGPT status item/);
  assert.match(buildScript, /upstreamNativeStatusItemPattern/);
  assert.doesNotMatch(buildScript, /setApplicationMenu\(Wt\),OQ\(v\),setTimeout\(\(\)=>appendEnhancementsToApplicationMenu/);
  assert.match(buildScript, /OpenCodex Dashboard/);
  assert.match(buildScript, /Codex ChatGPT Web/);
  assert.match(buildScript, /openUrl\('connect'\)/);
  const bundler = fs.readFileSync(path.join(__dirname, "bundle-enhancements.js"), "utf8");
  assert.match(bundler, /entry\.postStartCommand = enhancement\.postStartCommand/);
  assert.match(bundler, /entry\.connectCommand = enhancement\.connectCommand/);
});

test("verified installer supports fresh installs and recoverable rollback", () => {
  const installer = fs.readFileSync(path.join(__dirname, "install-verified-side-by-side.js"), "utf8");
  assert.match(installer, /requestedAsar \|\| sha256\(sourceAsar\)/);
  assert.match(installer, /launcherEnhancementsPrefix/);
  assert.match(installer, /isAnyCodexLauncher/);
  assert.match(installer, /isAnyBundledEnhancement/);
  assert.match(installer, /if \(fs\.existsSync\(installedLauncher\)\) fs\.renameSync/);
  assert.match(installer, /restoreInstalledTarget/);
  assert.match(installer, /failed-Codex-launcher\.app/);
  assert.match(installer, /preserveStaleStage/);
  assert.match(installer, /stale-stages/);
});

test("provider routing gate allows the signed macOS cold-start window", () => {
  const verifier = fs.readFileSync(path.join(__dirname, "verify-provider-routing.js"), "utf8");
  assert.match(verifier, /timeoutMs = 120_000/);
});

test("native launchers dispatch from manifest capabilities", () => {
  const hub = fs.readFileSync(path.join(__dirname, "..", "launcher", "EnhancementHub.swift"), "utf8");
  const launcher = fs.readFileSync(path.join(__dirname, "..", "launcher", "CodexLauncher.m"), "utf8");
  assert.match(launcher, /ConfigurePrivateRuntimeRouting/);
  assert.match(launcher, /openai_base_url/);
  assert.match(launcher, /model_catalog_json/);
  assert.match(launcher, /firstTableIndex/);
  assert.match(launcher, /insertObjects:routingLines/);
  assert.match(launcher, /SynchronizePrivateRuntimeModelCache/);
  assert.match(launcher, /--password-store=basic/);
  assert.match(launcher, /--use-mock-keychain/);
  assert.match(launcher, /PrivateRuntimeModelCacheReady/);
  assert.match(launcher, /OpenCodexHome\/models_cache\.json/);
  assert.match(launcher, /models_cache\.json/);
  assert.match(launcher, /button\.title = @" Codex"/);
  assert.match(launcher, /section\.enabled = NO/);
  assert.match(launcher, /✦ Enhancements/);
  assert.doesNotMatch(launcher, /InstallEnhancementStatusItem\(\);/);
  assert.match(launcher, /O_CLOEXEC/);
  const catalogHook = fs.readFileSync(
    path.join(__dirname, "..", "assets", "opencodex-runtime", "post-start.js"),
    "utf8",
  );
  assert.match(catalogHook, /waitForOpenCodexCache/);
  assert.match(catalogHook, /OpenCodex's catalog/);
  assert.match(catalogHook, /runtimeCachePath/);
  assert.match(hub, /enhancement\.kind == "web"/);
  assert.match(hub, /enhancement\.kind == "app"/);
  assert.match(hub, /enhancement\.kind == "terminal"/);
  assert.doesNotMatch(hub, /enhancement\.id == "(?:opencodex|codex-chatgpt-web)"/);
  assert.match(hub, /WebWindow\.shared\.show\(title: enhancement\.label/);
  assert.match(hub, /static func connect\(_ enhancement: Enhancement\)/);
  assert.match(hub, /enhancement\.connectCommand\?\.isEmpty == false/);
  assert.match(hub, /copyDiagnostics/);
  assert.match(hub, /Timer\.publish\(every: 5/);
  assert.match(launcher, /RequiredEnhancementsHealthy/);
  assert.match(launcher, /kRequiredServiceStartupAttempts = 480/);
  assert.match(launcher, /StopEnhancements\(\);[\s\S]*_requiredServiceWaitAttempts = 0/);
  assert.match(launcher, /ProcessTreeContainsPID/);
  assert.match(launcher, /unrelated process on port/);
  assert.match(hub, /SetEnhancementRuntimeEnabled/);
  assert.match(launcher, /void SetEnhancementRuntimeEnabled/);
  assert.match(launcher, /RemoveChatGPTWebModels/);
  assert.match(launcher, /toggle-refresh/);
  assert.match(hub, /WKNavigationDelegate/);
  assert.match(hub, /NSWorkspace\.shared\.open\(url\)/);
  const dashboard = fs.readFileSync(
    path.join(__dirname, "..", "assets", "codex-chatgpt-web-dashboard", "public", "index.html"),
    "utf8",
  );
  assert.match(dashboard, /private Chrome sign-in window/i);
  assert.match(dashboard, /Connect ChatGPT/);
  const dashboardServer = fs.readFileSync(
    path.join(__dirname, "..", "assets", "codex-chatgpt-web-dashboard", "server.js"),
    "utf8",
  );
  const loginFlow = fs.readFileSync(
    path.join(__dirname, "..", "assets", "codex-chatgpt-web-dashboard", "login.js"),
    "utf8",
  );
  assert.match(dashboardServer, /\/api\/connect/);
  assert.doesNotMatch(loginFlow, /\bsetup\b[\s\S]*--browser-only/);
  assert.doesNotMatch(dashboardServer, /--replace-codex-route/);
  assert.match(dashboardServer, /ensurePrivateCodexHome/);
  assert.doesNotMatch(dashboardServer, /syncCodexAuth|sourceAuthPath|copyFileSync/);
  assert.match(dashboardServer, /accountRouteHealth/);
  assert.match(dashboardServer, /browserSessionHealth/);
  assert.match(dashboardServer, /ready,/);
  assert.match(dashboardServer, /refreshModelCatalogs/);
  assert.match(dashboardServer, /codex-rebuild:\/\/refresh-models/);
  assert.match(dashboardServer, /CODEX_HOME: codexHome/);
  assert.match(dashboardServer, /opencodex/);
  assert.match(dashboardServer, /serviceHealth\(openCodexPort, "\/healthz"\)/);
  assert.match(dashboardServer, /bridgeProcess/);
  assert.match(dashboardServer, /ensureBridge/);
  assert.match(dashboardServer, /CODEX_CHATGPT_WEB_HOME/);
  assert.match(dashboardServer, /setupProcess\?\.kill\("SIGTERM"\)/);
  assert.match(dashboardServer, /restartOwnedBridge/);
  assert.doesNotMatch(loginFlow, /--restart-service/);
  assert.match(loginFlow, /Storage\.getCookies/);
  assert.doesNotMatch(loginFlow, /cpSync\(sourceProfile, targetProfile/);
  assert.match(loginFlow, /class DevToolsClient/);
  assert.match(loginFlow, /new WebSocket/);
  assert.match(loginFlow, /remote-allow-origins/);
  assert.match(loginFlow, /composerSelector/);
  assert.match(loginFlow, /loggedOutMarker/);
  assert.match(loginFlow, /login-profile/);
  assert.match(dashboardServer, /login\.js/);
  assert.match(launcher, /connectCommand/);
  assert.match(launcher, /LaunchConnectionEnhancement/);
  assert.match(launcher, /dashboardManagedConnection/);
  assert.match(launcher, /127\.0\.0\.1:17842\/api\/connect/);
  assert.match(launcher, /restartRuntimeForModelRefresh/);
  assert.match(launcher, /ActivateChromeLoginWindow/);
  assert.match(launcher, /EnhancementCodexHome/);
  assert.match(launcher, /PrepareOpenCodexHome/);
  assert.match(launcher, /IsolatePrivateCodexPath/);
  assert.match(launcher, /AcquireLauncherLock/);
  assert.match(launcher, /EnhancementAlreadyHealthy/);
  assert.match(launcher, /gEnhancementPreflightComplete/);
  assert.match(launcher, /DescendantProcessIDs/);
  assert.match(launcher, /TerminateProcessTree/);
  assert.match(launcher, /providers\[@"codex-chatgpt-web"\]/);
  assert.match(launcher, /@"adapter": @"openai-responses"/);
  assert.doesNotMatch(launcher, /@\[@"auth\.json", @"config\.toml"\]/);
  assert.match(launcher, /stringByAppendingPathComponent:kCodexHomeName/);
  assert.match(launcher, /OPENCODEX_HOME/);
  assert.match(launcher, /codex-chatgpt-web/);
  assert.match(launcher, /NSApplicationActivateIgnoringOtherApps/);
  assert.match(launcher, /\[kind isEqualToString:@"app"\]/);
  assert.match(launcher, /\[kind isEqualToString:@"terminal"\]/);
  assert.match(launcher, /ResolveEnhancementBinary\(enhDir, command\[0\]\)/);
  const postStart = fs.readFileSync(
    path.join(__dirname, "..", "assets", "opencodex-runtime", "post-start.js"),
    "utf8",
  );
  assert.doesNotMatch(postStart, /\["sync-cache", "--restart-codex"\]/);
  assert.match(postStart, /waitForChatGPTWebReadiness/);
  assert.match(postStart, /status\?\.ready === true/);
  assert.match(postStart, /!model\.slug\.startsWith\("codex-chatgpt-web\/"\)/);
  assert.match(postStart, /join\(runtimeHome, "models_cache\.json"\)/);
});
