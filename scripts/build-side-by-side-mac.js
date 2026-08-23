#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { bundleEnhancements } = require("./bundle-enhancements");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "out");
const ORIGINAL_CODEX_ICON = path.join(PROJECT_ROOT, "resources", "electron.icns");
const ORIGINAL_CODEX_ICON_PNG = path.join(PROJECT_ROOT, "resources", "CodexIcon.png");
const ORIGINAL_CODEX_ASSET_CATALOG = path.join(PROJECT_ROOT, "resources", "CodexAssets.car");
const ORIGINAL_CODEX_ASSET_CATALOG_SHA256 =
  "6dba073222496ebcfb6b1bdb83b223aa7a72ff56f95ff56b5b40888807cd103f";
const CODEX_ICON_RESOURCE_NAMES = [
  "electron.icns",
  "icon.icns",
  "icon-chatgpt.icns",
  "app.icns",
];
const CODEX_DOCK_ICON_RESOURCE_NAMES = [
  "icon.png",
  "icon-chatgpt.png",
];
const WRAPPER_ID = "io.haleclipse.codexdesktop.launcher";
const RUNTIME_ID = "io.haleclipse.codexdesktop.runtime";
// Ad-hoc signatures otherwise default their designated requirement to a CDHash,
// which changes whenever the ASAR changes and makes macOS ask for Keychain
// permission again after every rebuild. Keep the private runtime identity stable.
const RUNTIME_DESIGNATED_REQUIREMENT = `=designated => identifier "${RUNTIME_ID}"`;
const SOURCE_RUNTIME_IDS = new Set(["com.openai.codex", RUNTIME_ID]);

// Entitlements extracted from the official OpenAI app are team-bound (Apple
// Team ID 2DC432GLL2). Re-signing ad-hoc with those entitlements makes AMFI
// kill the runtime at exec (SIGKILL before any output), so strip team-bound
// keys and opt out of library validation — mirroring build-from-upstream.js.
const OPENAI_TEAM_ID = "2DC432GLL2";
const TEAM_BOUND_ENTITLEMENTS = new Set([
  "com.apple.application-identifier",
  "com.apple.developer.team-identifier",
  "com.apple.security.application-groups",
  "keychain-access-groups",
]);
const REQUIRED_LOCAL_ENTITLEMENTS = new Set([
  "com.apple.security.automation.apple-events",
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-library-validation",
  "com.apple.security.network.client",
]);

function valueContainsTeamIdentifier(value) {
  if (typeof value === "string") return value.includes(OPENAI_TEAM_ID);
  if (Array.isArray(value)) return value.some(valueContainsTeamIdentifier);
  if (value && typeof value === "object") return Object.values(value).some(valueContainsTeamIdentifier);
  return false;
}

function sanitizeEntitlements(entitlements) {
  const sanitized = {};
  for (const [key, value] of Object.entries(entitlements)) {
    if (TEAM_BOUND_ENTITLEMENTS.has(key)) continue;
    if (key.startsWith("com.apple.developer.")) continue;
    if (valueContainsTeamIdentifier(value)) continue;
    sanitized[key] = value;
  }
  // Hardened-runtime library validation requires matching Apple Team IDs.
  // Ad-hoc signatures have no Team ID, so opt out or dyld rejects the
  // separately signed framework before startup.
  sanitized["com.apple.security.cs.disable-library-validation"] = true;
  for (const key of REQUIRED_LOCAL_ENTITLEMENTS) {
    if (sanitized[key] !== true) throw new Error(`Required upstream entitlement is missing: ${key}`);
  }
  return sanitized;
}

function sanitizeEntitlementsFile(entitlementsPath) {
  const json = run("/usr/bin/plutil", ["-convert", "json", "-o", "-", entitlementsPath], {
    encoding: "utf-8",
  });
  const sanitized = sanitizeEntitlements(JSON.parse(json));
  run("/usr/bin/plutil", ["-convert", "xml1", "-o", entitlementsPath, "-"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    input: JSON.stringify(sanitized),
  });
}

function run(executable, args, options = {}) {
  return execFileSync(executable, args, {
    encoding: options.encoding,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    input: options.input,
  });
}

function plistValue(plistPath, key) {
  return run("/usr/bin/plutil", ["-extract", key, "raw", plistPath], { encoding: "utf-8" }).trim();
}

function plistHasKey(plistPath, key) {
  try {
    run("/usr/bin/plutil", ["-extract", key, "raw", plistPath]);
    return true;
  } catch {
    return false;
  }
}

function replacePlistString(plistPath, key, value) {
  run("/usr/bin/plutil", ["-replace", key, "-string", value, plistPath]);
}

function removePlistKey(plistPath, key) {
  if (plistHasKey(plistPath, key)) {
    run("/usr/bin/plutil", ["-remove", key, plistPath]);
  }
}

function clearDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function runtimeContentHash(runtimeApp, infoPath) {
  const hash = crypto.createHash("sha256");
  const excluded = new Set([
    "Contents/Info.plist",
    "Contents/_CodeSignature",
  ]);
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  function visit(absolutePath, relativePath) {
    const normalizedPath = relativePath.split(path.sep).join("/");
    if (excluded.has(normalizedPath)) return;

    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      hash.update(`L\0${normalizedPath}\0${fs.readlinkSync(absolutePath)}\0`);
      return;
    }
    if (stats.isDirectory()) {
      hash.update(`D\0${normalizedPath}\0${stats.mode & 0o777}\0`);
      for (const entry of fs.readdirSync(absolutePath).sort()) {
        visit(path.join(absolutePath, entry), path.join(relativePath, entry));
      }
      return;
    }
    if (!stats.isFile()) {
      throw new Error(`Unsupported runtime entry in content hash: ${absolutePath}`);
    }

    hash.update(`F\0${normalizedPath}\0${stats.mode & 0o777}\0${stats.size}\0`);
    const descriptor = fs.openSync(absolutePath, "r");
    try {
      let bytesRead = 0;
      do {
        bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
      } while (bytesRead > 0);
    } finally {
      fs.closeSync(descriptor);
    }
  }

  // Include the customized root metadata before the fingerprint itself is added,
  // avoiding a circular hash while still detecting every meaningful plist edit.
  hash.update("P\0Contents/Info.plist\0");
  hash.update(fs.readFileSync(infoPath));
  for (const entry of fs.readdirSync(runtimeApp).sort()) {
    visit(path.join(runtimeApp, entry), entry);
  }
  return hash.digest("hex");
}

function requireArchitecture(binaryPath, architecture, label) {
  const architectures = run("/usr/bin/lipo", ["-archs", binaryPath], { encoding: "utf-8" })
    .trim()
    .split(/\s+/);
  if (!architectures.includes(architecture)) {
    throw new Error(`${label} is not ${architecture}-compatible: ${architectures.join(" ")}`);
  }
}

function signBundledEnhancementApps(enhancementsRoot) {
  if (!fs.existsSync(enhancementsRoot)) return;
  for (const enhancementId of fs.readdirSync(enhancementsRoot)) {
    const enhancementDir = path.join(enhancementsRoot, enhancementId);
    if (!fs.statSync(enhancementDir).isDirectory()) continue;
    for (const entry of fs.readdirSync(enhancementDir)) {
      if (!entry.endsWith(".app")) continue;
      const appPath = path.join(enhancementDir, entry);
      run("/usr/bin/codesign", [
        "--force", "--deep", "--sign", "-", "--timestamp=none", "--options", "runtime", appPath,
      ]);
    }
  }
}

function extractEntitlements(appPath, destination) {
  const entitlements = run("/usr/bin/codesign", ["--display", "--entitlements", ":-", appPath]);
  if (!entitlements || entitlements.length === 0) {
    throw new Error(`No root entitlements found on ${appPath}`);
  }
  fs.writeFileSync(destination, entitlements);
  run("/usr/bin/plutil", ["-lint", destination]);
}

function normalizedPlist(plistPath) {
  const json = run("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath], {
    encoding: "utf-8",
  });
  return JSON.stringify(JSON.parse(json));
}

function parseArguments(argv) {
  let runtimeApp = path.join(OUT_DIR, "mac-x64", "Codex.app");
  let skipDmg = false;
  let skipPayload = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--runtime") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) {
        throw new Error("--runtime requires an app path");
      }
      runtimeApp = argv[index + 1];
      index += 1;
    } else if (argument === "--skip-dmg") {
      skipDmg = true;
    } else if (argument === "--skip-payload") {
      skipPayload = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (skipPayload && !skipDmg) {
    throw new Error("--skip-payload requires --skip-dmg; a thin launcher is not a standalone installer");
  }
  return { runtimeApp: path.resolve(runtimeApp), skipDmg, skipPayload };
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("The side-by-side macOS build must run on macOS");
  }

  const { runtimeApp, skipDmg, skipPayload } = parseArguments(process.argv.slice(2));
  const sourceInfo = path.join(runtimeApp, "Contents", "Info.plist");
  // The source may be the original upstream app (executable ChatGPT) or a
  // previously built side-by-side runtime (executable already renamed Codex).
  // Resolve the real name instead of hardcoding it.
  const sourceExecutableName = plistValue(sourceInfo, "CFBundleExecutable") || "ChatGPT";
  const sourceExecutable = path.join(runtimeApp, "Contents", "MacOS", sourceExecutableName);
  const sourceIcon = path.join(runtimeApp, "Contents", "Resources", "electron.icns");
  const sourceCli = path.join(runtimeApp, "Contents", "Resources", "codex");
  const sourceAsar = path.join(runtimeApp, "Contents", "Resources", "app.asar");
  if (![sourceInfo, sourceExecutable, sourceIcon, sourceCli, sourceAsar].every(fs.existsSync)) {
    throw new Error(`Invalid Codex runtime: ${runtimeApp}`);
  }
  if (!fs.existsSync(ORIGINAL_CODEX_ICON) ||
      !fs.existsSync(ORIGINAL_CODEX_ICON_PNG) ||
      !fs.existsSync(ORIGINAL_CODEX_ASSET_CATALOG) ||
      sha256(ORIGINAL_CODEX_ASSET_CATALOG) !== ORIGINAL_CODEX_ASSET_CATALOG_SHA256) {
    throw new Error("Original Codex icon resources are missing or invalid");
  }

  const sourceRuntimeId = plistValue(sourceInfo, "CFBundleIdentifier");
  if (!SOURCE_RUNTIME_IDS.has(sourceRuntimeId)) {
    throw new Error(`Unexpected source runtime bundle identifier: ${sourceRuntimeId}`);
  }
  requireArchitecture(sourceExecutable, "x86_64", "Codex runtime");
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", runtimeApp]);
  run("/usr/bin/codesign", ["--verify", "--strict", sourceCli]);

  const version = plistValue(sourceInfo, "CFBundleShortVersionString");
  const build = plistValue(sourceInfo, "CFBundleVersion");
  // ChatGPT's web shell validates the native client build number. Keep the
  // exact upstream value; side-by-side updates are keyed by bundle identity
  // plus CodexRebuildContentSHA256, not by inventing a build suffix.
  const customBuild = build;
  const sourceCliHash = sha256(sourceCli);
  const outputRoot = path.join(OUT_DIR, "side-by-side-mac-x64");
  const runtimeOutputRoot = path.join(OUT_DIR, "side-by-side-runtime-mac-x64");
  const uniqueRuntimeApp = path.join(runtimeOutputRoot, "Codex.app");
  const uniqueRuntimeInfo = path.join(uniqueRuntimeApp, "Contents", "Info.plist");
  const uniqueRuntimeResources = path.join(uniqueRuntimeApp, "Contents", "Resources");
  const uniqueRuntimeCli = path.join(uniqueRuntimeApp, "Contents", "Resources", "codex");
  const uniqueRuntimeExecutable = path.join(uniqueRuntimeApp, "Contents", "MacOS", "Codex");
  const wrapperApp = path.join(outputRoot, "Codex.app");
  const contents = path.join(wrapperApp, "Contents");
  const macOSDirectory = path.join(contents, "MacOS");
  const resourcesDirectory = path.join(contents, "Resources");
  const wrapperIcon = path.join(resourcesDirectory, "electron.icns");
  const wrapperAssets = path.join(resourcesDirectory, "Assets.car");
  const payload = path.join(resourcesDirectory, "Codex.payload");
  const launcherExecutable = path.join(macOSDirectory, "CodexLauncher");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-side-by-side-"));
  const sourceEntitlements = path.join(temporaryDirectory, "source-entitlements.plist");
  const signedEntitlements = path.join(temporaryDirectory, "signed-entitlements.plist");

  try {
    clearDirectory(outputRoot);
    clearDirectory(runtimeOutputRoot);
    fs.mkdirSync(macOSDirectory, { recursive: true });
    fs.mkdirSync(resourcesDirectory, { recursive: true });

    console.log(`   [runtime] copying ${runtimeApp}`);
    extractEntitlements(runtimeApp, sourceEntitlements);
    sanitizeEntitlementsFile(sourceEntitlements);
    run("/usr/bin/ditto", [runtimeApp, uniqueRuntimeApp]);

    // Preserve the upstream ASAR package identity. The renderer uses it to
    // select Codex routes and changing it makes AppRoutes throw during startup.
    // Side-by-side isolation is provided by the private bundle identifier,
    // renamed executable, CODEX_HOME, and explicit Electron user-data path.

    if (sourceExecutableName !== "Codex") {
      fs.renameSync(path.join(uniqueRuntimeApp, "Contents", "MacOS", sourceExecutableName),
        uniqueRuntimeExecutable);
    }

    replacePlistString(uniqueRuntimeInfo, "CFBundleIdentifier", RUNTIME_ID);
    replacePlistString(uniqueRuntimeInfo, "CFBundleExecutable", "Codex");
    replacePlistString(uniqueRuntimeInfo, "CFBundleVersion", customBuild);
    replacePlistString(uniqueRuntimeInfo, "CFBundleDisplayName", "Codex");
    replacePlistString(uniqueRuntimeInfo, "CFBundleName", "Codex");
    replacePlistString(uniqueRuntimeInfo, "CFBundleIconFile", "electron.icns");
    replacePlistString(uniqueRuntimeInfo, "CFBundleIconName", "Icon");
    replacePlistString(uniqueRuntimeInfo, "CodexAppIconBaseName", "icon");
    removePlistKey(uniqueRuntimeInfo, "CFBundleIconName~mac");
    removePlistKey(uniqueRuntimeInfo, "CFBundleIconFiles");
    removePlistKey(uniqueRuntimeInfo, "CFBundleIconFiles~mac");
    removePlistKey(uniqueRuntimeInfo, "CFBundleIcons");
    removePlistKey(uniqueRuntimeInfo, "CFBundleIcons~mac");
    removePlistKey(uniqueRuntimeInfo, "CFBundleURLTypes");
    removePlistKey(uniqueRuntimeInfo, "CodexRebuildContentSHA256");
    for (const resourceName of CODEX_ICON_RESOURCE_NAMES) {
      fs.copyFileSync(ORIGINAL_CODEX_ICON, path.join(uniqueRuntimeResources, resourceName));
    }
    for (const resourceName of CODEX_DOCK_ICON_RESOURCE_NAMES) {
      fs.copyFileSync(ORIGINAL_CODEX_ICON_PNG, path.join(uniqueRuntimeResources, resourceName));
    }
    fs.copyFileSync(ORIGINAL_CODEX_ASSET_CATALOG,
      path.join(uniqueRuntimeResources, "Assets.car"));

    const runtimeAsar = path.join(uniqueRuntimeResources, "app.asar");
    if (fs.existsSync(runtimeAsar)) {
      console.log("   [asar] integrating ✦ Enhancements into native tray menu");
      const npxBin = fs.existsSync("/usr/local/bin/npx") ? "/usr/local/bin/npx" : "npx";
      const extractAsarDir = path.join(temporaryDirectory, "_extracted_asar");
      run(npxBin, ["--yes", "asar", "extract", runtimeAsar, extractAsarDir]);

      const viteBuildDir = path.join(extractAsarDir, ".vite", "build");
      if (fs.existsSync(viteBuildDir)) {
        const files = fs.readdirSync(viteBuildDir);
        for (const file of files) {
          if (file.startsWith("main-") && file.endsWith(".js")) {
            const mainJsPath = path.join(viteBuildDir, file);
            let mainCode = fs.readFileSync(mainJsPath, "utf8");

const helperFn = `
/* codex-rebuild:enhancements-tray-v1 */
function getEnhancementsTrayMenu(elModule) {
  const fallback = (shell) => ({
    label: '✦ Enhancements',
    submenu: [{
      label: 'Enhancements Settings…',
      click: () => { if (shell) shell.openExternal('codex-rebuild://settings'); }
    }]
  });

  try {
    const fs = require('fs');
    const path = require('path');
    const el = elModule || require('electron');
    const shell = el.shell || (el.default && el.default.shell);
    const BrowserWindow = el.BrowserWindow || (el.default && el.default.BrowserWindow);
    const net = el.net || (el.default && el.default.net);
    const resourcesPath = process.resourcesPath;
    const manifestCandidates = [
      process.env.CODEX_REBUILD_ENHANCEMENTS_PATH
        ? path.join(process.env.CODEX_REBUILD_ENHANCEMENTS_PATH, 'manifest.json')
        : null,
      resourcesPath ? path.join(resourcesPath, 'enhancements', 'manifest.json') : null,
      resourcesPath
        ? path.resolve(resourcesPath, '..', '..', '..', 'enhancements', 'manifest.json')
        : null
    ].filter(Boolean);
    const manifestFile = manifestCandidates.find((candidate) => fs.existsSync(candidate));
    if (!manifestFile || !fs.existsSync(manifestFile)) return fallback(shell);

    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const subItems = [];
    for (const enhancement of Array.isArray(manifest.enhancements) ? manifest.enhancements : []) {
      const ui = enhancement.ui || {};
      const label = ui.label || enhancement.id || 'Enhancement';
      const openUrl = (view) => {
        if (!shell) return;
        const query = new URLSearchParams({ id: enhancement.id, view });
        shell.openExternal('codex-rebuild://enhancement?' + query.toString());
      };

      if (ui.kind === 'web' && ui.url) {
        const connectItem = Array.isArray(enhancement.connectCommand) && enhancement.connectCommand.length > 0
          ? [{
              label: enhancement.id === 'codex-chatgpt-web' ? 'Connect ChatGPT' : 'Connect',
              click: () => {
                try {
                  const request = net && net.request
                    ? net.request({
                        method: 'POST',
                        url: new URL('/api/connect', ui.url).toString()
                      })
                    : null;
                  if (request) {
                    request.on('error', () => {});
                    request.end();
                  } else {
                    return openUrl('connect');
                  }
                  if (!BrowserWindow) return openUrl('window');
                  const win = new BrowserWindow({
                    width: 1100,
                    height: 750,
                    title: label,
                    titleBarStyle: 'hiddenInset',
                    webPreferences: { nodeIntegration: false, contextIsolation: true }
                  });
                  win.loadURL(ui.url);
                } catch { openUrl('connect'); }
              }
            }]
          : [];
        subItems.push({
          label,
          submenu: [
            {
              label: 'In-App Window',
              click: () => {
                try {
                  if (!BrowserWindow) return openUrl('window');
                  const win = new BrowserWindow({
                    width: 1100,
                    height: 750,
                    title: label,
                    titleBarStyle: 'hiddenInset',
                    webPreferences: { nodeIntegration: false, contextIsolation: true }
                  });
                  win.loadURL(ui.url);
                } catch { openUrl('window'); }
              }
            },
            ...connectItem,
            { label: 'Default Browser', click: () => openUrl('browser') }
          ]
        });
      } else {
        subItems.push({
          label: ui.openLabel || label,
          click: () => openUrl('launch')
        });
      }
    }

    if (subItems.length > 0) subItems.push({ type: 'separator' });
    subItems.push({
      label: 'Enhancements Settings…',
      click: () => { if (shell) shell.openExternal('codex-rebuild://settings'); }
    });
    return { label: '✦ Enhancements', submenu: subItems };
  } catch (error) {
    try {
      const el = elModule || require('electron');
      return fallback(el.shell || (el.default && el.default.shell));
    } catch { return fallback(null); }
  }
}

function appendEnhancementsToApplicationMenu(menu, elModule) {
  try {
    const el = elModule || require('electron');
    const Menu = el.Menu || (el.default && el.default.Menu);
    const MenuItem = el.MenuItem || (el.default && el.default.MenuItem);
    const shell = el.shell || (el.default && el.default.shell);
    const BrowserWindow = el.BrowserWindow || (el.default && el.default.BrowserWindow);
    const net = el.net || (el.default && el.default.net);
    const appMenu = (menu && Array.isArray(menu.items) ? menu.items : [])
      .find((item) => item.role === 'appMenu' || item.label === 'Codex') ||
      (menu && menu.items ? menu.items[0] : null);
    if (!Menu || !MenuItem || !appMenu || !appMenu.submenu) return;
    if (appMenu.submenu.items.some((item) => item.label === '✦ Enhancements')) return;
    const showDashboard = (title, url) => {
      if (BrowserWindow) {
        const win = new BrowserWindow({
          width: 1100,
          height: 750,
          title,
          titleBarStyle: 'hiddenInset',
          webPreferences: { nodeIntegration: false, contextIsolation: true }
        });
        win.loadURL(url);
      } else if (shell) {
        shell.openExternal(url);
      }
    };
    const connectChatGPT = () => {
      try {
        const request = net && net.request
          ? net.request({ method: 'POST', url: 'http://127.0.0.1:17842/api/connect' })
          : null;
        if (request) {
          request.on('error', () => {});
          request.end();
        }
        showDashboard('Codex ChatGPT Web', 'http://127.0.0.1:17842');
      } catch {}
    };
    const applicationItems = [
      { label: 'OpenCodex Dashboard', click: () => showDashboard('OpenCodex Gateway', 'http://127.0.0.1:10100') },
      { label: 'Codex ChatGPT Web', click: () => showDashboard('Codex ChatGPT Web', 'http://127.0.0.1:17842') },
      { label: 'Connect ChatGPT', click: connectChatGPT },
      { type: 'separator' },
      { label: 'Enhancements Settings…', click: () => { if (shell) shell.openExternal('codex-rebuild://settings'); } }
    ];
    appMenu.submenu.append(new MenuItem({ type: 'separator' }));
    appMenu.submenu.append(new MenuItem({ label: '✦ Enhancements', submenu: applicationItems }));
    Menu.setApplicationMenu(menu);
  } catch {}
}
`;
            const targetPattern = "return[...h,...h.length>0?[{type:`separator`}]:[]";
            // Builds are often based on the last private runtime. Do not append
            // another tray helper when that runtime already contains ours.
            if (mainCode.includes("codex-rebuild:enhancements-tray-v1")) {
              console.log(`   [asar] enhancement tray already integrated in ${file}`);
            } else if (mainCode.includes(targetPattern)) {
              mainCode = helperFn + "\n" + mainCode.replace(
                targetPattern,
                "return[...h,...h.length>0?[{type:`separator`}]:[],getEnhancementsTrayMenu(l),{type:`separator`}"
              );
              mainCode = mainCode.replace(
                "updatePersistentTrayMenu(){process.platform===`linux`&&this.tray.setContextMenu",
                "updatePersistentTrayMenu(){(process.platform===`linux`||process.platform===`darwin`)&&this.tray.setContextMenu"
              );
              mainCode = mainCode.replace(
                "if(process.platform===`darwin`){this.tray.on(`mouse-down`",
                "if(process.platform===`darwin`){this.updatePersistentTrayMenu();this.tray.on(`mouse-down`"
              );
              // The native macOS status-item addon only understands the
              // upstream menu schema, which currently ends at Quit ChatGPT.
              // Force the Electron tray implementation so this same
              // right-side icon renders the enhancement submenu.
              mainCode = mainCode.replace(
                "process.platform===`darwin`&&e.getNativeStatusItemState!=null&&e.getComputerUseServiceProcessIdentifier!=null&&e.onNativeStatusItemMenuAction!=null",
                "false"
              );
              fs.writeFileSync(mainJsPath, mainCode, "utf8");
              console.log(`   [asar] successfully patched ${file} (tray + enhancements)`);
            }
          }
        }
      }

      run(npxBin, ["--yes", "asar", "pack", extractAsarDir, runtimeAsar]);
      fs.rmSync(extractAsarDir, { recursive: true, force: true });
    }

    console.log("   [runtime-enhancements] bundling into private runtime");
    await bundleEnhancements(uniqueRuntimeApp, { planOnly: false, platform: "mac-x64" });
    signBundledEnhancementApps(path.join(uniqueRuntimeApp, "Contents", "Resources", "enhancements"));

    const contentHash = runtimeContentHash(uniqueRuntimeApp, uniqueRuntimeInfo);
    replacePlistString(uniqueRuntimeInfo, "CodexRebuildContentSHA256", contentHash);

    // Sign only the outer runtime bundle. Every nested signature, including the
    // official Codex CLI, stays byte-for-byte identical to the source runtime.
    run("/usr/bin/codesign", [
      "--force", "--sign", "-", "--timestamp=none", "--options", "runtime",
      "--entitlements", sourceEntitlements,
      "--requirements", RUNTIME_DESIGNATED_REQUIREMENT,
      uniqueRuntimeApp,
    ]);
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", uniqueRuntimeApp]);
    run("/usr/bin/codesign", ["--verify", "--strict", uniqueRuntimeCli]);
    extractEntitlements(uniqueRuntimeApp, signedEntitlements);

    if (plistValue(uniqueRuntimeInfo, "CFBundleIdentifier") !== RUNTIME_ID) {
      throw new Error("Unique runtime bundle identifier verification failed");
    }
    if (plistValue(uniqueRuntimeInfo, "CFBundleDisplayName") !== "Codex" ||
        plistValue(uniqueRuntimeInfo, "CFBundleName") !== "Codex" ||
        plistValue(uniqueRuntimeInfo, "CFBundleExecutable") !== "Codex" ||
        plistValue(uniqueRuntimeInfo, "CFBundleIconFile") !== "electron.icns" ||
        plistValue(uniqueRuntimeInfo, "CFBundleIconName") !== "Icon" ||
        plistValue(uniqueRuntimeInfo, "CodexAppIconBaseName") !== "icon" ||
        plistHasKey(uniqueRuntimeInfo, "CFBundleIconFiles") ||
        plistHasKey(uniqueRuntimeInfo, "CFBundleIcons") ||
        plistHasKey(uniqueRuntimeInfo, "CFBundleIcons~mac")) {
      throw new Error("Unique runtime Codex branding verification failed");
    }
    if (plistHasKey(uniqueRuntimeInfo, "CFBundleURLTypes")) {
      throw new Error("The private runtime must not own a URL scheme");
    }
    if (normalizedPlist(sourceEntitlements) !== normalizedPlist(signedEntitlements)) {
      throw new Error("Unique runtime root entitlements changed during signing");
    }
    if (sha256(uniqueRuntimeCli) !== sourceCliHash) {
      throw new Error("Unique runtime changed the official Codex CLI bytes");
    }
    const expectedIconHash = sha256(ORIGINAL_CODEX_ICON);
    for (const resourceName of CODEX_ICON_RESOURCE_NAMES) {
      if (sha256(path.join(uniqueRuntimeResources, resourceName)) !== expectedIconHash) {
        throw new Error(`Unique runtime icon fallback is incorrect: ${resourceName}`);
      }
    }
    const expectedPngHash = sha256(ORIGINAL_CODEX_ICON_PNG);
    for (const resourceName of CODEX_DOCK_ICON_RESOURCE_NAMES) {
      if (sha256(path.join(uniqueRuntimeResources, resourceName)) !== expectedPngHash) {
        throw new Error(`Unique runtime Dock icon fallback is incorrect: ${resourceName}`);
      }
    }
    if (sha256(path.join(uniqueRuntimeResources, "Assets.car")) !==
        ORIGINAL_CODEX_ASSET_CATALOG_SHA256) {
      throw new Error("Unique runtime historical Codex asset catalog is incorrect");
    }

    fs.copyFileSync(path.join(PROJECT_ROOT, "launcher", "Info.plist"), path.join(contents, "Info.plist"));
    fs.copyFileSync(ORIGINAL_CODEX_ICON, wrapperIcon);
    fs.copyFileSync(ORIGINAL_CODEX_ASSET_CATALOG, wrapperAssets);
    if (fs.existsSync(path.join(PROJECT_ROOT, "resources", "chatgptTemplate.png"))) {
      fs.copyFileSync(path.join(PROJECT_ROOT, "resources", "chatgptTemplate.png"), path.join(contents, "Resources", "chatgptTemplate.png"));
    }
    if (fs.existsSync(path.join(PROJECT_ROOT, "resources", "chatgptTemplate@2x.png"))) {
      fs.copyFileSync(path.join(PROJECT_ROOT, "resources", "chatgptTemplate@2x.png"), path.join(contents, "Resources", "chatgptTemplate@2x.png"));
    }
    replacePlistString(path.join(contents, "Info.plist"), "CFBundleShortVersionString", version);
    replacePlistString(path.join(contents, "Info.plist"), "CFBundleVersion", customBuild);

    console.log("   [launcher] compiling Intel native launcher (ObjC + SwiftUI)");
    run("/usr/bin/xcrun", [
      "swiftc",
      "-target", "x86_64-apple-macos13.0",
      "-parse-as-library",
      "-Xcc", "-fobjc-arc",
      "-Xcc", "-Wall",
      "-Xcc", "-Wextra",
      "-Xcc", "-Werror",
      "-framework", "Cocoa",
      "-framework", "WebKit",
      path.join(PROJECT_ROOT, "launcher", "CodexLauncher.m"),
      path.join(PROJECT_ROOT, "launcher", "EnhancementHub.swift"),
      "-o", launcherExecutable,
    ]);
    fs.chmodSync(launcherExecutable, 0o755);
    requireArchitecture(launcherExecutable, "x86_64", "Codex launcher");

    if (!skipPayload) {
      console.log("   [payload] embedding uniquely identified runtime");
      run("/usr/bin/ditto", [uniqueRuntimeApp, payload]);
      if (sha256(path.join(payload, "Contents", "Resources", "codex")) !== sourceCliHash) {
        throw new Error("Embedded payload changed the official Codex CLI bytes");
      }
      for (const resourceName of CODEX_ICON_RESOURCE_NAMES) {
        if (sha256(path.join(payload, "Contents", "Resources", resourceName)) !==
            expectedIconHash) {
          throw new Error(`Embedded payload icon fallback is incorrect: ${resourceName}`);
        }
      }
      for (const resourceName of CODEX_DOCK_ICON_RESOURCE_NAMES) {
        if (sha256(path.join(payload, "Contents", "Resources", resourceName)) !==
            expectedPngHash) {
          throw new Error(`Embedded payload Dock icon fallback is incorrect: ${resourceName}`);
        }
      }
      if (sha256(path.join(payload, "Contents", "Resources", "Assets.car")) !==
          ORIGINAL_CODEX_ASSET_CATALOG_SHA256) {
        throw new Error("Embedded payload historical Codex asset catalog is incorrect");
      }
    }

    console.log("   [enhancements] bundling");
    await bundleEnhancements(wrapperApp, { planOnly: false, platform: "mac-x64" });
    signBundledEnhancementApps(path.join(wrapperApp, "Contents", "Resources", "enhancements"));

    run("/usr/bin/codesign", [
      "--force", "--sign", "-", "--timestamp=none", "--options", "runtime", launcherExecutable,
    ]);
    run("/usr/bin/codesign", [
      "--force", "--sign", "-", "--timestamp=none", "--options", "runtime", wrapperApp,
    ]);
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", wrapperApp]);

    if (plistValue(path.join(contents, "Info.plist"), "CFBundleIdentifier") !== WRAPPER_ID) {
      throw new Error("Wrapper bundle identifier verification failed");
    }
    if (plistValue(path.join(contents, "Info.plist"), "CFBundleDisplayName") !== "Codex" ||
        plistValue(path.join(contents, "Info.plist"), "CFBundleName") !== "Codex" ||
        plistValue(path.join(contents, "Info.plist"), "CFBundleIconFile") !== "electron.icns") {
      throw new Error("Wrapper Codex branding verification failed");
    }
    if (sha256(wrapperIcon) !== sha256(ORIGINAL_CODEX_ICON)) {
      throw new Error("Wrapper does not contain the original Codex icon");
    }
    if (sha256(wrapperAssets) !== ORIGINAL_CODEX_ASSET_CATALOG_SHA256 ||
        plistValue(path.join(contents, "Info.plist"), "CFBundleIconName") !== "Icon") {
      throw new Error("Wrapper does not contain the historical Codex icon catalog");
    }
    const launcherURLTypes = JSON.parse(run("/usr/bin/plutil", [
      "-extract", "CFBundleURLTypes", "json", "-o", "-",
      path.join(contents, "Info.plist"),
    ], { encoding: "utf-8" }));
    if (JSON.stringify(launcherURLTypes) !== JSON.stringify([{
      CFBundleTypeRole: "Viewer",
      CFBundleURLName: WRAPPER_ID,
      CFBundleURLSchemes: ["codex-rebuild"],
    }])) {
      throw new Error("Wrapper protocol registration verification failed");
    }
    if (path.extname(payload) === ".app") {
      throw new Error("Embedded runtime payload must not be registered as an application bundle");
    }

    console.log(`   [ok] runtime ${RUNTIME_ID} ${version} (${customBuild})`);
    console.log(`   [ok] CLI SHA-256 ${sourceCliHash}`);
    console.log(`   [ok] content SHA-256 ${contentHash}`);
    console.log(`   [ok] launcher ${wrapperApp}${skipPayload ? " (thin)" : ""}`);

    if (!skipDmg) {
      const applicationsLink = path.join(outputRoot, "Applications");
      fs.symlinkSync("/Applications", applicationsLink);
      const dmgPath = path.join(OUT_DIR, `Codex-side-by-side-mac-x64-${version}.dmg`);
      fs.rmSync(dmgPath, { force: true });
      console.log("   [dmg] adding Applications drag target and compressing");
      run("/usr/bin/hdiutil", [
        "create", "-volname", "Codex", "-srcfolder", outputRoot,
        "-ov", "-format", "UDZO", dmgPath,
      ]);
      console.log(`   [ok] ${dmgPath}`);
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\n[x] ${error.message}`);
  process.exit(1);
});
