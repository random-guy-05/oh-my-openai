/**
 * Shared utilities for patch scripts.
 * Provides multi-platform bundle location, common helpers, and a
 * process-scoped AST cache so the ~14 MB Codex monolith is parsed
 * at most once per source-identity per pass.
 *
 * Why: `patch-local-canonical-mode.js` previously called Acorn
 * `parse` seven times against the same monolith, which is what made
 * the canonical custom-feature patches slow enough that they had been
 * commented out of `patch-all.js`. A shared cache keyed on
 * `path.resolve(filePath) + source` lets the selector, composer,
 * context, model-picker, and CSS patches all reuse the same AST
 * while still correctly rebuilding it whenever a patch rewrites the
 * bundle on disk (cache key is also keyed by source identity — so any
 * different source string triggers a fresh parse).
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const PROJECT_ROOT = path.resolve(
  process.env.CODEX_REBUILD_PROJECT_ROOT || path.join(__dirname, ".."),
);
const SRC_DIR = path.resolve(
  process.env.CODEX_REBUILD_SRC_DIR || path.join(PROJECT_ROOT, "src"),
);

/**
 * Locate bundles matching a filename pattern across platform directories.
 *
 * @param {object} opts
 * @param {"build"|"assets"} opts.dir - Subdirectory type:
 *   "build"  -> src/{plat}/.vite/build/
 *   "assets" -> src/{plat}/webview/assets/
 * @param {RegExp} opts.pattern - Filename regex (e.g. /^index-.*\.js$/)
 * @param {string} [opts.platform] - Restrict to a single platform
 * @returns {Array<{platform: string, path: string}>}
 */
function locateBundles({ dir, pattern, platform }) {
  const dirMap = {
    build: (plat) => path.join(SRC_DIR, plat, "_asar", ".vite", "build"),
    assets: (plat) => path.join(SRC_DIR, plat, "_asar", "webview", "assets"),
  };

  // Legacy fallback paths (flat src/ without _asar subdirs)
  const legacyMap = {
    build: path.join(SRC_DIR, ".vite", "build"),
    assets: path.join(SRC_DIR, "webview", "assets"),
  };

  const getDir = dirMap[dir];
  if (!getDir) throw new Error(`Unknown dir type: ${dir}`);

  const ALL_PLATFORMS = ["mac-arm64", "mac-x64", "win"];
  const platforms = platform
    ? [platform]
    : ALL_PLATFORMS.filter((p) => fs.existsSync(getDir(p)));

  // Legacy fallback
  if (platforms.length === 0) {
    const fallback = legacyMap[dir];
    if (fallback && fs.existsSync(fallback)) {
      const files = fs.readdirSync(fallback).filter((f) => pattern.test(f));
      if (files.length > 0) {
        const target =
          files.length > 1 ? files.find((f) => f !== "main.js") || files[0] : files[0];
        return [{ platform: "legacy", path: path.join(fallback, target) }];
      }
    }
    return [];
  }

  const results = [];
  for (const plat of platforms) {
    const d = getDir(plat);
    if (!fs.existsSync(d)) continue;

    const files = fs.readdirSync(d).filter((f) => pattern.test(f));
    if (files.length === 0) {
      console.warn(`  [!] ${plat}: no match for ${pattern}`);
      continue;
    }

    const target =
      files.length > 1 ? files.find((f) => f !== "main.js") || files[0] : files[0];

    results.push({ platform: plat, path: path.join(d, target) });
  }

  return results;
}

/**
 * Return path relative to project root.
 */
function relPath(absPath) {
  return path.relative(PROJECT_ROOT, absPath);
}

/**
 * Process-scoped AST cache.
 *
 * Keyed by absolute file path, with the cache value containing both the
 * source string and the parsed AST. A lookup returns the cached AST
 * whenever the supplied source is identical to the previously-seen source
 * for that path. As soon as a patch writes back its modified source, the
 * next call sees the new source and re-parses — exactly once.
 *
 * Different platforms never collide because each platform has its own
 * bundle directory.
 */
const _astCache = new Map();

/**
 * Source-first cached parse, a drop-in replacement for the per-script
 * `parseBundle` helpers that the patch scripts already call.
 *
 * Wraps `acorn.parse` with a `"<relPath> failed to parse: <message>"`
 * error so existing callers do not need to wrap the parse call themselves.
 *
 * @param {string} source JavaScript source to parse.
 * @param {string} filePath Absolute path the source came from (used
 *   for error labels and as the cache key).
 * @returns {object} Acorn AST with `.start`/`.end` for every node.
 */
function parseBundleCached(source, filePath) {
  if (typeof source !== "string") {
    throw new Error("parseBundleCached: source must be a string");
  }
  if (!filePath) {
    throw new Error("parseBundleCached: filePath required for cache key");
  }
  const absPath = path.resolve(filePath);
  const cached = _astCache.get(absPath);
  if (cached && cached.source === source) {
    return cached.ast;
  }
  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${relPath(absPath)} failed to parse: ${error.message}`);
  }
  _astCache.set(absPath, { source, ast });
  return ast;
}

/**
 * Forget the cached AST for one path (or all paths if omitted) so the
 * next `parseBundleCached` call re-reads the bundle from disk and emits
 * a fresh AST. Call this after writing a modified source back to disk if
 * a later patch needs to observe the new file content rather than the
 * thawed source string (rare inside a single `patch-all` invocation —
 * call sites normally thread the rewritten source through as the next
 * `source` argument).
 */
function invalidateAstCache(bundlePath) {
  if (!bundlePath) {
    _astCache.clear();
    return;
  }
  _astCache.delete(path.resolve(bundlePath));
}

module.exports = {
  invalidateAstCache,
  locateBundles,
  parseBundleCached,
  relPath,
  SRC_DIR,
  PROJECT_ROOT,
};
