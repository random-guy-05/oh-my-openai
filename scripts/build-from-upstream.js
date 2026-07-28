#!/usr/bin/env node
/**
 * build-from-upstream.js — Patch upstream Codex and repackage
 *
 * For macOS and Windows: no forge needed.
 * Takes the upstream app, patches ASAR in-place, retains the official codex CLI, and outputs a distributable.
 *
 * Usage:
 *   node scripts/build-from-upstream.js --platform mac-arm64
 *   node scripts/build-from-upstream.js --platform mac-x64
 *   node scripts/build-from-upstream.js --platform win
 *   node scripts/build-from-upstream.js --platform mac-x64 --check-source
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { isDeepStrictEqual } = require("util");
const { execFileSync, execSync, spawnSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PROJECT_ROOT, "src");
const OUT_DIR = path.join(PROJECT_ROOT, "out");
const SKIP_SIGNATURE = process.argv.includes("--skip-signature");
const SKIP_SOURCE_SIGNATURE = process.argv.includes("--skip-source-signature");
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

const OPENAI_BUNDLE_ID = "com.openai.codex";
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

// ─── Helpers ────────────────────────────────────────────────────

function clearDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) { count += copyRecursive(s, d); }
    else if (e.isSymbolicLink()) {
      const target = fs.readlinkSync(s);
      try { fs.symlinkSync(target, d); } catch {}
      count++;
    } else {
      fs.copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readPlistValue(plistPath, key) {
  return execFileSync("/usr/bin/plutil", ["-extract", key, "raw", plistPath], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function setPlistString(plistPath, key, value) {
  execFileSync("/usr/bin/plutil", ["-replace", key, "-string", value, plistPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function plistHasKey(plistPath, key) {
  return spawnSync("/usr/bin/plutil", ["-extract", key, "raw", plistPath], {
    stdio: "ignore",
  }).status === 0;
}

function removePlistKey(plistPath, key) {
  if (!plistHasKey(plistPath, key)) return;
  execFileSync("/usr/bin/plutil", ["-remove", key, plistPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readMachOArchitectures(binaryPath) {
  return execFileSync("/usr/bin/lipo", ["-archs", binaryPath], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim().split(/\s+/).filter(Boolean);
}

function verifyOfficialOpenAISignature(appPath) {
  const requirement = `identifier "${OPENAI_BUNDLE_ID}" and anchor apple generic and certificate leaf[subject.OU] = "${OPENAI_TEAM_ID}"`;
  // Validate the complete upstream resource seal and every nested code object
  // before any patched content is copied or locally re-signed.
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", `-R=${requirement}`, appPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function findAppBundles(dir) {
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(dir, entry.name);
    if (entry.name.endsWith(".app")) {
      if (fs.existsSync(path.join(candidate, "Contents", "Resources", "app.asar"))) found.push(candidate);
      continue;
    }
    found.push(...findAppBundles(candidate));
  }
  return found;
}

function loadSourceMetadata(platformDir) {
  const metadataPath = path.join(platformDir, ".upstream-source.json");
  if (!fs.existsSync(metadataPath)) return null;
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata root is not an object");
    }
    return metadata;
  } catch (error) {
    throw new Error(`Invalid upstream source metadata at ${metadataPath}: ${error.message}`);
  }
}

function validateSourceMetadata(metadata, source) {
  const expected = {
    bundleIdentifier: source.bundleIdentifier,
    version: source.version,
    build: source.build,
    architecture: source.expectedArchitecture,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (metadata[key] !== value) {
      throw new Error(`upstream metadata mismatch for ${key} (metadata=${metadata[key]}, source=${value})`);
    }
  }
  for (const key of ["appAsarSha256", "codexSha256"]) {
    if (typeof metadata[key] !== "string" || !/^[a-f0-9]{64}$/.test(metadata[key])) {
      throw new Error(`upstream metadata has an invalid ${key}`);
    }
  }
}

function inspectMacSource(appPath, platform, asarDir, sourceMetadata) {
  const infoPlist = path.join(appPath, "Contents", "Info.plist");
  const resourcesDir = path.join(appPath, "Contents", "Resources");
  const appAsar = path.join(resourcesDir, "app.asar");
  const codexPath = path.join(resourcesDir, "codex");
  if (!fs.existsSync(infoPlist) || !fs.existsSync(appAsar) || !fs.existsSync(codexPath)) {
    throw new Error("missing Info.plist, app.asar, or official codex CLI");
  }

  const bundleIdentifier = readPlistValue(infoPlist, "CFBundleIdentifier");
  if (bundleIdentifier !== OPENAI_BUNDLE_ID) {
    throw new Error(`unexpected bundle identifier ${bundleIdentifier}`);
  }
  if (!SKIP_SIGNATURE && !SKIP_SOURCE_SIGNATURE) verifyOfficialOpenAISignature(appPath);

  const executableName = readPlistValue(infoPlist, "CFBundleExecutable");
  const executablePath = path.join(appPath, "Contents", "MacOS", executableName);
  const expectedArchitecture = platform === "mac-arm64" ? "arm64" : "x86_64";
  const appArchitectures = readMachOArchitectures(executablePath);
  const codexArchitectures = readMachOArchitectures(codexPath);
  if (!appArchitectures.includes(expectedArchitecture) || !codexArchitectures.includes(expectedArchitecture)) {
    throw new Error(`architecture mismatch (app=${appArchitectures.join(",")}, codex=${codexArchitectures.join(",")})`);
  }
  if (!SKIP_SIGNATURE) {
    execFileSync("/usr/bin/codesign", ["--verify", "--strict", codexPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  const version = readPlistValue(infoPlist, "CFBundleShortVersionString");
  const build = readPlistValue(infoPlist, "CFBundleVersion");
  const patchedVersion = getVersion(asarDir);
  if (version !== patchedVersion) {
    throw new Error(`version mismatch (source=${version}, patched ASAR=${patchedVersion})`);
  }

  const appAsarSha256 = sha256File(appAsar);
  const codexSha256 = sha256File(codexPath);
  if (sourceMetadata) {
    validateSourceMetadata(sourceMetadata, {
      build,
      bundleIdentifier,
      expectedArchitecture,
      version,
    });
    if (sourceMetadata.appAsarSha256 !== appAsarSha256) {
      throw new Error("app.asar does not match the synchronized upstream snapshot");
    }
    if (sourceMetadata.codexSha256 !== codexSha256) {
      throw new Error("codex CLI does not match the synchronized upstream snapshot");
    }
  }

  return {
    appAsarSha256,
    appPath,
    build,
    bundleIdentifier,
    codexPath,
    codexSha256,
    expectedArchitecture,
    executablePath,
    infoPlist,
    resourcesDir,
    version,
  };
}

function resolveMacSource(platform, platformDir, asarDir) {
  const variant = platform === "mac-arm64" ? "arm64" : "x64";
  const extractDir = path.join(os.tmpdir(), "codex-sync", `${variant}-extract`);
  const candidates = [];
  if (process.env.CODEX_UPSTREAM_APP) candidates.push(path.resolve(process.env.CODEX_UPSTREAM_APP));
  candidates.push(...findAppBundles(extractDir));
  if (platform === "mac-x64") candidates.push("/Applications/ChatGPT.app");

  const sourceMetadata = loadSourceMetadata(platformDir);
  if (platform === "mac-x64") {
    if (!sourceMetadata) {
      throw new Error(
        "Missing required Intel upstream metadata. Run npm run sync:installed:x64 first, " +
        "or let sync-upstream.js populate it from the official appcast archive."
      );
    }
    // Accept either the local /Applications/ChatGPT.app snapshot (sourceKind =
    // "installed-app-snapshot") OR the CI-downloaded appcast archive (sourceKind
    // = "appcast-archive"). The local snapshot path still wins when present so
    // that a developer's installed Codex.app remains the authoritative source.
    const ALLOWED_INTEL_SOURCE_KINDS = new Set([
      "installed-app-snapshot",
      "appcast-archive",
    ]);
    if (!ALLOWED_INTEL_SOURCE_KINDS.has(sourceMetadata.sourceKind)) {
      throw new Error(`Unsupported Intel upstream source kind: ${sourceMetadata.sourceKind}`);
    }
    if (sourceMetadata.sourceKind === "appcast-archive") {
      // The CI-downloaded Codex.app inside the extract dir is the source.
      // Insert it as a candidate so we search there before /Applications.
      candidates.unshift(...findAppBundles(extractDir));
    }
  } else if (!sourceMetadata) {
    console.log("   [source] legacy arm64 cache has no snapshot metadata; relying on its complete OpenAI signature seal");
  }
  const seen = new Set();
  const failures = [];
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (!fs.existsSync(candidate)) continue;
    try {
      return inspectMacSource(candidate, platform, asarDir, sourceMetadata);
    } catch (error) {
      failures.push(`${candidate}: ${error.message}`);
    }
  }

  const detail = failures.length > 0 ? `\n${failures.map((failure) => `  - ${failure}`).join("\n")}` : "";
  throw new Error(`No matching official OpenAI ${platform} source app found.${detail}\nRun npm run sync:installed:x64 first.`);
}

function readCodeSigningEntitlements(targetPath) {
  const result = spawnSync("/usr/bin/codesign", ["-d", "--entitlements", "-", "--xml", targetPath], {
    encoding: "utf-8",
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const start = output.indexOf("<?xml");
  const end = output.lastIndexOf("</plist>");
  if (result.status !== 0 || start < 0 || end < start) {
    throw new Error(`Unable to read upstream entitlements for ${targetPath}`);
  }
  const xml = output.slice(start, end + "</plist>".length);
  const json = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], {
    encoding: "utf-8",
    input: xml,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(json);
}

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
  // Ad-hoc signatures have no Team ID, so a local Electron rebuild must opt
  // out or dyld rejects its separately signed framework before startup.
  sanitized["com.apple.security.cs.disable-library-validation"] = true;
  for (const key of REQUIRED_LOCAL_ENTITLEMENTS) {
    if (sanitized[key] !== true) throw new Error(`Required upstream entitlement is missing: ${key}`);
  }
  return sanitized;
}

function writeEntitlementsPlist(entitlements, destination) {
  execFileSync("/usr/bin/plutil", ["-convert", "xml1", "-o", destination, "-"], {
    input: JSON.stringify(entitlements),
    stdio: ["pipe", "pipe", "pipe"],
  });
  fs.chmodSync(destination, 0o600);
}

function verifyAdHocTarget(targetPath, label) {
  const signature = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", targetPath], {
    encoding: "utf-8",
  });
  const detail = `${signature.stdout || ""}\n${signature.stderr || ""}`;
  if (
    signature.status !== 0 ||
    !detail.includes("Signature=adhoc") ||
    !detail.includes("TeamIdentifier=not set")
  ) {
    throw new Error(`${label} does not use the local ad-hoc signing identity`);
  }
}

function applyCodexBranding(outApp) {
  const infoPlist = path.join(outApp, "Contents", "Info.plist");
  const resourcesDir = path.join(outApp, "Contents", "Resources");
  if (!fs.existsSync(ORIGINAL_CODEX_ICON) ||
      !fs.existsSync(ORIGINAL_CODEX_ICON_PNG) ||
      !fs.existsSync(ORIGINAL_CODEX_ASSET_CATALOG) ||
      sha256File(ORIGINAL_CODEX_ASSET_CATALOG) !== ORIGINAL_CODEX_ASSET_CATALOG_SHA256) {
    throw new Error("Original Codex icon resources are missing or invalid");
  }
  for (const resourceName of CODEX_ICON_RESOURCE_NAMES) {
    fs.copyFileSync(ORIGINAL_CODEX_ICON, path.join(resourcesDir, resourceName));
  }
  for (const resourceName of CODEX_DOCK_ICON_RESOURCE_NAMES) {
    fs.copyFileSync(ORIGINAL_CODEX_ICON_PNG, path.join(resourcesDir, resourceName));
  }
  fs.copyFileSync(ORIGINAL_CODEX_ASSET_CATALOG, path.join(resourcesDir, "Assets.car"));
  setPlistString(infoPlist, "CFBundleDisplayName", "Codex");
  setPlistString(infoPlist, "CFBundleName", "Codex");
  setPlistString(infoPlist, "CFBundleIconFile", "electron.icns");
  setPlistString(infoPlist, "CFBundleIconName", "Icon");
  setPlistString(infoPlist, "CodexAppIconBaseName", "icon");
  for (const key of [
    "CFBundleIconName~mac",
    "CFBundleIconFiles", "CFBundleIconFiles~mac",
    "CFBundleIcons", "CFBundleIcons~mac",
  ]) {
    removePlistKey(infoPlist, key);
  }
  const expectedIconHash = sha256File(ORIGINAL_CODEX_ICON);
  for (const resourceName of CODEX_ICON_RESOURCE_NAMES) {
    if (sha256File(path.join(resourcesDir, resourceName)) !== expectedIconHash) {
      throw new Error(`Original Codex icon copy verification failed: ${resourceName}`);
    }
  }
  const expectedPngHash = sha256File(ORIGINAL_CODEX_ICON_PNG);
  for (const resourceName of CODEX_DOCK_ICON_RESOURCE_NAMES) {
    if (sha256File(path.join(resourcesDir, resourceName)) !== expectedPngHash) {
      throw new Error(`Original Codex Dock icon copy verification failed: ${resourceName}`);
    }
  }
  if (sha256File(path.join(resourcesDir, "Assets.car")) !==
      ORIGINAL_CODEX_ASSET_CATALOG_SHA256) {
    throw new Error("Historical Codex asset catalog verification failed");
  }

  const alertsApp = path.join(
    outApp,
    "Contents", "Frameworks", "Codex Framework.framework", "Versions", "Current",
    "Helpers", "Codex (Alerts).app",
  );
  const alertsInfo = path.join(alertsApp, "Contents", "Info.plist");
  const alertsIcon = path.join(alertsApp, "Contents", "Resources", "app.icns");
  if (!fs.existsSync(alertsInfo) || !fs.existsSync(path.dirname(alertsIcon))) {
    throw new Error("Codex Alerts helper icon bundle is missing");
  }
  fs.copyFileSync(ORIGINAL_CODEX_ICON, alertsIcon);
  setPlistString(alertsInfo, "CFBundleIconFile", "app.icns");
  for (const key of [
    "CFBundleIconName", "CFBundleIconName~mac",
    "CFBundleIconFiles", "CFBundleIconFiles~mac",
    "CFBundleIcons", "CFBundleIcons~mac",
  ]) {
    removePlistKey(alertsInfo, key);
  }
  if (sha256File(alertsIcon) !== expectedIconHash ||
      readPlistValue(alertsInfo, "CFBundleIconFile") !== "app.icns" ||
      plistHasKey(alertsInfo, "CFBundleIconName")) {
    throw new Error("Codex Alerts helper icon verification failed");
  }
  console.log("   [brand] Codex name + original Codex icon across every macOS fallback");
}

function assertOfficialCliPreserved(source, resourcesDir) {
  const builtCodex = path.join(resourcesDir, "codex");
  if (!fs.existsSync(builtCodex)) throw new Error("Official bundled codex CLI is missing from the built app");
  const builtHash = sha256File(builtCodex);
  if (builtHash !== source.codexSha256) throw new Error("Built codex CLI differs from the official upstream CLI");
  const architectures = readMachOArchitectures(builtCodex);
  if (!architectures.includes(source.expectedArchitecture)) {
    throw new Error(`Built codex CLI architecture mismatch: ${architectures.join(",")}`);
  }
  if (!SKIP_SIGNATURE) {
    execFileSync("/usr/bin/codesign", ["--verify", "--strict", builtCodex], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  console.log(`   [codex] official CLI preserved (${builtHash.slice(0, 16)}...)`);
}

function signAndVerifyLocalMacApp(source, outApp, asarPath) {
  const upstreamEntitlements = readCodeSigningEntitlements(source.appPath);
  const sanitizedEntitlements = sanitizeEntitlements(upstreamEntitlements);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-local-sign-"));
  const entitlementsPath = path.join(tempDir, "entitlements.plist");

  try {
    writeEntitlementsPlist(sanitizedEntitlements, entitlementsPath);
    console.log("   [codesign] removing top-level upstream signature");
    execFileSync("/usr/bin/codesign", ["--remove-signature", outApp], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const attribute of ["com.apple.quarantine", "com.apple.provenance"]) {
      try {
        execFileSync("/usr/bin/xattr", ["-rd", attribute, outApp], {
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {}
    }

    console.log("   [codesign] ad-hoc signing with sanitized upstream entitlements");
    execFileSync("/usr/bin/codesign", [
      "--force",
      "--deep",
      "--sign", "-",
      "--timestamp=none",
      "--options", "runtime",
      "--entitlements", entitlementsPath,
      outApp,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=4", outApp], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const signature = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", outApp], { encoding: "utf-8" });
    const signatureDetail = `${signature.stdout || ""}\n${signature.stderr || ""}`;
    if (signature.status !== 0 || !signatureDetail.includes("Signature=adhoc")) {
      throw new Error("Built application is not ad-hoc signed as expected");
    }

    const builtEntitlements = readCodeSigningEntitlements(outApp);
    if (!isDeepStrictEqual(builtEntitlements, sanitizedEntitlements)) {
      throw new Error("Built entitlements differ from the sanitized upstream entitlements");
    }
    for (const key of TEAM_BOUND_ENTITLEMENTS) {
      if (key in builtEntitlements) throw new Error(`Team-bound entitlement survived local signing: ${key}`);
    }
    if (valueContainsTeamIdentifier(builtEntitlements)) {
      throw new Error("OpenAI team identifier survived in local signing entitlements");
    }

    // Hardened-runtime library validation requires the Electron framework and
    // renderer to use the same Team ID as the main executable. A shallow
    // signature can pass `codesign --verify --deep` yet still abort at dlopen.
    const frameworkPath = path.join(
      outApp,
      "Contents",
      "Frameworks",
      "Codex Framework.framework",
    );
    const rendererPath = path.join(
      frameworkPath,
      "Versions",
      "Current",
      "Helpers",
      "Codex (Renderer).app",
    );
    verifyAdHocTarget(frameworkPath, "Electron framework");
    verifyAdHocTarget(rendererPath, "Electron renderer helper");
    const rendererEntitlements = readCodeSigningEntitlements(rendererPath);
    for (const key of [
      "com.apple.security.cs.allow-jit",
      "com.apple.security.cs.allow-unsigned-executable-memory",
    ]) {
      if (rendererEntitlements[key] !== true) {
        throw new Error(`Renderer helper is missing required entitlement: ${key}`);
      }
    }

    // `codesign --deep` leaves the separately executed upstream CLI intact;
    // verify its bytes, architecture, and official signature again afterward.
    assertOfficialCliPreserved(source, path.join(outApp, "Contents", "Resources"));

    const infoPlist = path.join(outApp, "Contents", "Info.plist");
    if (readPlistValue(infoPlist, "CFBundleIdentifier") !== source.bundleIdentifier) {
      throw new Error("Bundle identifier changed unexpectedly");
    }
    if (readPlistValue(infoPlist, "CFBundleDisplayName") !== "Codex" ||
        readPlistValue(infoPlist, "CFBundleName") !== "Codex" ||
        readPlistValue(infoPlist, "CFBundleIconFile") !== "electron.icns" ||
        readPlistValue(infoPlist, "CFBundleIconName") !== "Icon" ||
        readPlistValue(infoPlist, "CodexAppIconBaseName") !== "icon" ||
        plistHasKey(infoPlist, "CFBundleIconFiles") ||
        plistHasKey(infoPlist, "CFBundleIcons") ||
        plistHasKey(infoPlist, "CFBundleIcons~mac")) {
      throw new Error("Codex name/icon branding verification failed");
    }
    if (sha256File(path.join(outApp, "Contents", "Resources", "Assets.car")) !==
        ORIGINAL_CODEX_ASSET_CATALOG_SHA256) {
      throw new Error("Historical Codex icon asset catalog changed unexpectedly");
    }

    const expectedAsarHash = computeAsarHeaderHash(asarPath);
    const plistAsarHash = readPlistValue(infoPlist, "ElectronAsarIntegrity.Resources/app\\.asar.hash");
    if (plistAsarHash !== expectedAsarHash) throw new Error("ASAR integrity verification failed after signing");
    console.log("   [ok] strict deep signature + entitlements + ASAR integrity verified");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ─── macOS build ────────────────────────────────────────────────

function buildMac(platform, { checkSourceOnly = false, skipDmg = false } = {}) {
  const platformDir = path.join(SRC_DIR, platform);
  const asarDir = path.join(platformDir, "_asar");

  if (!fs.existsSync(asarDir)) {
    console.error(`[x] ${platform}/_asar/ not found. Run sync-upstream first.`);
    process.exit(1);
  }

  // 1. Resolve and validate an exact official OpenAI source bundle.
  const source = resolveMacSource(platform, platformDir, asarDir);
  console.log(`   [source] ${source.appPath}`);
  console.log(`   [source] official ${source.version} ${source.expectedArchitecture}, ASAR ${source.appAsarSha256.slice(0, 16)}...`);
  if (checkSourceOnly) {
    console.log("   [ok] complete source signature, metadata, architecture, version, ASAR, and CLI binding verified");
    return;
  }

  // 2. Copy .app to output (ditto preserves symlinks + resource forks)
  const outAppDir = path.join(OUT_DIR, platform);
  clearDir(outAppDir);
  const outApp = path.join(outAppDir, "Codex.app");
  console.log("   [copy] Codex.app -> out/");
  execFileSync("/usr/bin/ditto", [source.appPath, outApp], { stdio: "pipe" });

  const resourcesDir = path.join(outApp, "Contents", "Resources");

  // 3. Repack patched ASAR
  const asarPath = path.join(resourcesDir, "app.asar");
  console.log("   [asar pack] _asar/ -> app.asar");
  execSync(`npx asar pack "${asarDir}" "${asarPath}"`);

  // 4. Update ASAR integrity hash in Info.plist
  const infoPlist = path.join(outApp, "Contents", "Info.plist");
  if (fs.existsSync(infoPlist)) {
    updateAsarIntegrity(asarPath, infoPlist);
  }

  // 5. Apply the Codex name/icon without altering bundle identity or URL schemes.
  applyCodexBranding(outApp);

  // 6. Keep the exact official bundled codex CLI from the source snapshot.
  assertOfficialCliPreserved(source, resourcesDir);

  // 7. Ad-hoc sign for this local build and fail closed if verification does not pass.
  // Explicit --skip-signature is for local packaging when the source bytes and
  // metadata are valid but Apple's upstream seal is unavailable.
  if (SKIP_SIGNATURE) console.log("   [codesign] skipped by explicit --skip-signature");
  else signAndVerifyLocalMacApp(source, outApp, asarPath);

  if (skipDmg) {
    console.log(`   [ok] ${outApp} (standalone DMG skipped)`);
    return;
  }

  // 8. Create DMG
  const version = getVersion(asarDir);
  const dmgName = `Codex-${platform}-${version}.dmg`;
  const dmgPath = path.join(OUT_DIR, dmgName);
  console.log(`   [dmg] ${dmgName}`);
  execFileSync("/usr/bin/hdiutil", ["create", "-volname", "Codex", "-srcfolder", outAppDir, "-ov", "-format", "UDZO", dmgPath], { stdio: "pipe" });
  const sizeMB = (fs.statSync(dmgPath).size / 1048576).toFixed(1);
  console.log(`   [ok] ${dmgPath} (${sizeMB} MB)`);
}

// ─── Windows build ──────────────────────────────────────────────

function buildWin(platform) {
  const platformDir = path.join(SRC_DIR, platform);
  const asarDir = path.join(platformDir, "_asar");

  if (!fs.existsSync(asarDir)) {
    console.error(`[x] win/_asar/ not found. Run sync-upstream first.`);
    process.exit(1);
  }

  // Windows: use the MSIX extract cache
  const tempDir = path.join(require("os").tmpdir(), "codex-sync");
  const extractDir = path.join(tempDir, "win-extract");
  const appDir = path.join(extractDir, "app");

  if (!fs.existsSync(appDir)) {
    console.error(`[x] MSIX extract not found. Run sync-upstream first.`);
    process.exit(1);
  }

  // Copy app/ to output
  const outAppDir = path.join(OUT_DIR, "win");
  clearDir(outAppDir);
  const outApp = path.join(outAppDir, "Codex-win32-x64");
  console.log("   [copy] MSIX app/ -> out/");
  copyRecursive(appDir, outApp);

  const resourcesDir = path.join(outApp, "resources");

  // Compute old ASAR header hash (before repack)
  const asarPath = path.join(resourcesDir, "app.asar");
  const oldHash = computeAsarHeaderHash(asarPath);
  console.log(`   [integrity] old hash: ${oldHash.slice(0, 16)}...`);

  // Repack patched ASAR
  console.log("   [asar pack] _asar/ -> app.asar");
  execSync(`npx asar pack "${asarDir}" "${asarPath}"`);

  // Compute new hash and patch exe
  const newHash = computeAsarHeaderHash(asarPath);
  console.log(`   [integrity] new hash: ${newHash.slice(0, 16)}...`);

  if (oldHash !== newHash) {
    // Find Codex.exe in app root
    const exePath = path.join(outApp, "Codex.exe");
    if (fs.existsSync(exePath)) {
      patchExeHash(exePath, oldHash, newHash);
    } else {
      console.log("   [!] Codex.exe not found for hash patching");
    }
  }

  // Keep the official upstream codex CLI.
  const codexPath = path.join(resourcesDir, "codex.exe");
  if (!fs.existsSync(codexPath)) throw new Error("Official Windows codex CLI is missing");
  console.log(`   [codex] official CLI preserved (${sha256File(codexPath).slice(0, 16)}...)`);

  // Create ZIP
  const version = getVersion(asarDir);
  const zipName = `Codex-win-x64-${version}.zip`;
  const zipPath = path.join(OUT_DIR, zipName);
  console.log(`   [zip] ${zipName}`);
  execSync(`7zz a -tzip -mx=5 "${zipPath}" .`, { cwd: outApp });

  const sizeMB = (fs.statSync(zipPath).size / 1048576).toFixed(1);
  console.log(`   [ok] ${zipPath} (${sizeMB} MB)`);
}

// ─── ASAR integrity ─────────────────────────────────────────────

function computeAsarHeaderHash(asarPath) {
  const crypto = require("crypto");
  const buf = fs.readFileSync(asarPath);
  const headerSize = buf.readUInt32LE(12);
  const header = buf.slice(16, 16 + headerSize);
  return crypto.createHash("sha256").update(header).digest("hex");
}

function patchExeHash(exePath, oldHash, newHash) {
  const buf = fs.readFileSync(exePath);
  const oldBuf = Buffer.from(oldHash, "ascii");
  const idx = buf.indexOf(oldBuf);
  if (idx < 0) {
    console.log("   [!] old hash not found in exe");
    return;
  }
  Buffer.from(newHash, "ascii").copy(buf, idx);
  fs.writeFileSync(exePath, buf);
  console.log(`   [integrity] exe hash patched at offset ${idx}`);
}

function updateAsarIntegrity(asarPath, infoPlistPath) {
  const newHash = computeAsarHeaderHash(asarPath);
  execSync(`plutil -replace ElectronAsarIntegrity.Resources/app\\\\.asar.hash -string "${newHash}" "${infoPlistPath}"`, { stdio: "pipe" });
  execSync(`plutil -replace ElectronAsarIntegrity.Resources/app\\\\.asar.algorithm -string "SHA256" "${infoPlistPath}"`, { stdio: "pipe" });

  // Verify
  const verify = execSync(`plutil -extract ElectronAsarIntegrity.Resources/app\\\\.asar.hash raw "${infoPlistPath}"`, { encoding: "utf-8" }).trim();
  if (verify === newHash) {
    console.log(`   [integrity] hash updated: ${newHash.slice(0, 16)}...`);
  } else {
    throw new Error(`ASAR integrity verify failed`);
  }
}

// ─── Shared ─────────────────────────────────────────────────────

function getVersion(asarDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(asarDir, "package.json"), "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const platIdx = args.indexOf("--platform");
  const platform = platIdx !== -1 ? args[platIdx + 1] : null;
  const checkSourceOnly = args.includes("--check-source");
  const skipDmg = args.includes("--skip-dmg");

  if (!platform || !["mac-arm64", "mac-x64", "win"].includes(platform)) {
    console.error("[x] Usage: build-from-upstream.js --platform <mac-arm64|mac-x64|win> [--skip-source-signature|--skip-signature]");
    process.exit(1);
  }

  console.log(`\n== Build from upstream: ${platform} ==\n`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (platform.startsWith("mac")) {
    buildMac(platform, { checkSourceOnly, skipDmg });
  } else {
    if (checkSourceOnly) throw new Error("--check-source is currently supported only for macOS");
    if (skipDmg) throw new Error("--skip-dmg is supported only for macOS");
    buildWin(platform);
  }
}

main();
