# Graph Report - scripts  (2026-07-27)

## Corpus Check
- 52 files · ~53,825 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 819 nodes · 1241 edges · 52 communities (51 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Canonical Mode Runtime|Canonical Mode Runtime]]
- [[_COMMUNITY_Upstream Build Pipeline|Upstream Build Pipeline]]
- [[_COMMUNITY_Upstream Sync Pipeline|Upstream Sync Pipeline]]
- [[_COMMUNITY_Latest Model Patch|Latest Model Patch]]
- [[_COMMUNITY_Chat Transport Features|Chat Transport Features]]
- [[_COMMUNITY_Side-by-Side Build|Side-by-Side Build]]
- [[_COMMUNITY_Transcript Handoff|Transcript Handoff]]
- [[_COMMUNITY_Feature Gate Catalog|Feature Gate Catalog]]
- [[_COMMUNITY_Microsoft Store Fetch|Microsoft Store Fetch]]
- [[_COMMUNITY_Turn Usage Tracking|Turn Usage Tracking]]
- [[_COMMUNITY_Live Catalog Hotswap|Live Catalog Hotswap]]
- [[_COMMUNITY_Rebase Audit|Rebase Audit]]
- [[_COMMUNITY_Update Checks|Update Checks]]
- [[_COMMUNITY_Usage Controls|Usage Controls]]
- [[_COMMUNITY_Plugin Authorization|Plugin Authorization]]
- [[_COMMUNITY_Resource Saver|Resource Saver]]
- [[_COMMUNITY_Core Feature Gates|Core Feature Gates]]
- [[_COMMUNITY_Usage Control Tests|Usage Control Tests]]
- [[_COMMUNITY_Chat Transport Tests|Chat Transport Tests]]
- [[_COMMUNITY_Feature Verification|Feature Verification]]
- [[_COMMUNITY_Source Preparation|Source Preparation]]
- [[_COMMUNITY_Chat Catalog V3|Chat Catalog V3]]
- [[_COMMUNITY_Chat Catalog V5|Chat Catalog V5]]
- [[_COMMUNITY_Chat History Overlay|Chat History Overlay]]
- [[_COMMUNITY_Real Chat Runtime|Real Chat Runtime]]
- [[_COMMUNITY_Transcript Publisher|Transcript Publisher]]
- [[_COMMUNITY_Side-by-Side Scheme|Side-by-Side Scheme]]
- [[_COMMUNITY_Development Launcher|Development Launcher]]
- [[_COMMUNITY_Chat Catalog V4|Chat Catalog V4]]
- [[_COMMUNITY_Chat Picker Styling|Chat Picker Styling]]
- [[_COMMUNITY_Chat UX Runtime|Chat UX Runtime]]
- [[_COMMUNITY_Live Handoff Test|Live Handoff Test]]
- [[_COMMUNITY_Updater Patch|Updater Patch]]
- [[_COMMUNITY_Profile Isolation|Profile Isolation]]
- [[_COMMUNITY_Statsig Mapping|Statsig Mapping]]
- [[_COMMUNITY_Native Module Sync|Native Module Sync]]
- [[_COMMUNITY_Chat Catalog V3B|Chat Catalog V3B]]
- [[_COMMUNITY_Chat Catalog V3C|Chat Catalog V3C]]
- [[_COMMUNITY_Archive Delete Patch|Archive Delete Patch]]
- [[_COMMUNITY_Work Mode Switching|Work Mode Switching]]
- [[_COMMUNITY_Copyright Patch|Copyright Patch]]
- [[_COMMUNITY_DevTools Patch|DevTools Patch]]
- [[_COMMUNITY_Fast Mode Patch|Fast Mode Patch]]
- [[_COMMUNITY_Internationalization Patch|Internationalization Patch]]
- [[_COMMUNITY_CLI Project Sync|CLI Project Sync]]
- [[_COMMUNITY_Patch Utilities|Patch Utilities]]
- [[_COMMUNITY_Dynamic Config Catalog|Dynamic Config Catalog]]
- [[_COMMUNITY_Version Bumping|Version Bumping]]
- [[_COMMUNITY_Patch Orchestration|Patch Orchestration]]
- [[_COMMUNITY_i18n Gate Layer|i18n Gate Layer]]
- [[_COMMUNITY_Collaboration UI Gate|Collaboration UI Gate]]
- [[_COMMUNITY_Voice Input Gate|Voice Input Gate]]

## God Nodes (most connected - your core abstractions)
1. `relPath()` - 51 edges
2. `Feature Gates` - 20 edges
3. `parse()` - 16 edges
4. `main()` - 14 edges
5. `HUn Feature-Key Registry` - 14 edges
6. `signAndVerifyLocalMacApp()` - 12 edges
7. `SRC_DIR` - 12 edges
8. `Statsig Cloud-Control Mapping` - 12 edges
9. `locateBundles()` - 11 edges
10. `syncMac()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `parse()`  [INFERRED]
  patch-copyright.js → _apply-chat-extras-render-v1.js
- `main()` --calls--> `parse()`  [INFERRED]
  patch-devtools.js → _apply-chat-extras-render-v1.js
- `main()` --calls--> `parse()`  [INFERRED]
  patch-fast-mode.js → _apply-chat-extras-render-v1.js
- `main()` --calls--> `parse()`  [INFERRED]
  patch-i18n.js → _apply-chat-extras-render-v1.js
- `parseBundle()` --calls--> `parse()`  [INFERRED]
  patch-latest-models.js → _apply-chat-extras-render-v1.js

## Import Cycles
- None detected.

## Communities (52 total, 1 thin omitted)

### Community 0 - "Canonical Mode Runtime"
Cohesion: 0.09
Nodes (45): countOccurrences(), findFunction(), fs, functionBodyText(), installLocalModeRuntime(), locateTargets(), main(), { parse } (+37 more)

### Community 1 - "Upstream Build Pipeline"
Cohesion: 0.09
Nodes (45): applyCodexBranding(), assertOfficialCliPreserved(), buildMac(), buildWin(), clearDir(), CODEX_DOCK_ICON_RESOURCE_NAMES, CODEX_ICON_RESOURCE_NAMES, computeAsarHeaderHash() (+37 more)

### Community 2 - "Upstream Sync Pipeline"
Cohesion: 0.08
Nodes (43): args, assembleOutput(), certsDir, CHECK_ONLY, clearDir(), copyRecursive(), countFiles(), crypto (+35 more)

### Community 3 - "Latest Model Patch"
Cohesion: 0.10
Nodes (39): ALL_PLATFORMS, ALLOWED_MODELS, callbackHasExactAllowedFilterShape(), callbackPreservesHidden(), candidateBundles(), collectBridgePatches(), collectSelectionPatches(), findAllowedModelFilterCallbacks() (+31 more)

### Community 4 - "Chat Transport Features"
Cohesion: 0.08
Nodes (20): acorn, actionRow, APP_MAIN, appMain, assert(), ASSETS, checks, errorBoundaryAnchors (+12 more)

### Community 5 - "Side-by-Side Build"
Cohesion: 0.12
Nodes (29): clearDirectory(), CODEX_DOCK_ICON_RESOURCE_NAMES, CODEX_ICON_RESOURCE_NAMES, computeAsarHeaderHash(), crypto, { execFileSync }, extractEntitlements(), fs (+21 more)

### Community 6 - "Transcript Handoff"
Cohesion: 0.08
Nodes (25): acorn, ASSETS, fs, installHandoffRuntime(), main(), MONO, parseOk(), path (+17 more)

### Community 7 - "Feature Gate Catalog"
Cohesion: 0.08
Nodes (26): Feature Gates, ef, GNe, ICn, iUt, Iwn, jxn, Pvn (+18 more)

### Community 8 - "Microsoft Store Fetch"
Cohesion: 0.17
Nodes (24): certsDir, deepFind(), deepFindAll(), deepFindAttr(), downloadFile(), extraCAs, findNested(), formatSize() (+16 more)

### Community 9 - "Turn Usage Tracking"
Cohesion: 0.12
Nodes (17): acorn, ASSETS, buildBadge(), detectAliases(), fs, functionExtent(), installTurnUsageRuntime(), main() (+9 more)

### Community 10 - "Live Catalog Hotswap"
Cohesion: 0.11
Nodes (16): asarHeaderHash(), crypto, { execFileSync, execSync }, fs, h1, LAUNCHER, PACKED, path (+8 more)

### Community 11 - "Rebase Audit"
Cohesion: 0.11
Nodes (17): acorn, assets, checks, crypto, failures, files, fs, local (+9 more)

### Community 12 - "Update Checks"
Cohesion: 0.17
Nodes (17): certsDir, checkAppcast(), checkMacArm64Version(), checkMacX64Version(), checkWindowsVersion(), extraCAs, formatSize(), fs (+9 more)

### Community 13 - "Usage Controls"
Cohesion: 0.22
Nodes (16): parse(), findFunctions(), fs, functionText(), insertions(), locateTargets(), main(), patchStatusBundle() (+8 more)

### Community 14 - "Plugin Authorization"
Cohesion: 0.20
Nodes (14): FEATURE_CONTEXTS, FEATURE_KEYS, findBrowserAvailPatches(), findFeatureDefaultPatches(), findGoalGatePatches(), findPluginAuthPatches(), findStatsigGatePatches(), fs (+6 more)

### Community 15 - "Resource Saver"
Cohesion: 0.17
Nodes (15): fs, locateTargets(), main(), { parse }, parseBundle(), patchSource(), path, replacement() (+7 more)

### Community 16 - "Core Feature Gates"
Cohesion: 0.17
Nodes (16): HUn, Gate 1156958996: collaboration_modes, Gate 1615536597: shell_snapshot, Gate 1786883712: unified_exec, Gate 2307253562: codex_git_commit, Gate 2357796820: apps, Gate 2734851136: responses_websockets_v2, Gate 2828273915: responses_websockets (+8 more)

### Community 17 - "Usage Control Tests"
Cohesion: 0.12
Nodes (12): assertTaskLimitWithoutRuntime(), installUsageRuntime(), assert, configuredAnswers, last, MemoryStorage, pendingSummary, rows (+4 more)

### Community 18 - "Chat Transport Tests"
Cohesion: 0.13
Nodes (13): acorn, ASSETS, ast, fs, local, localSource, mono, native (+5 more)

### Community 19 - "Feature Verification"
Cohesion: 0.19
Nodes (13): acorn, assetsDir(), FEATURES, findBundle(), findTopLevelFunction(), freeIdentifiers(), fs, KNOWN_GLOBALS (+5 more)

### Community 20 - "Source Preparation"
Cohesion: 0.20
Nodes (13): copyRecursive(), ensureVendorExtracted(), { execSync }, fs, MACOS_STRIP, MACOS_STRIP_DIRS, main(), path (+5 more)

### Community 21 - "Chat Catalog V3"
Cohesion: 0.21
Nodes (11): acorn, ASSETS, fs, functionExtentByName(), main(), MONO, monoName, parseOrThrow() (+3 more)

### Community 22 - "Chat Catalog V5"
Cohesion: 0.21
Nodes (11): acorn, ASSETS, fs, functionExtentByName(), main(), MONO, monoName, patchStickyAllowSol() (+3 more)

### Community 23 - "Chat History Overlay"
Cohesion: 0.23
Nodes (11): acorn, ASSETS, findLocalFile(), findThreadComponent(), fs, main(), OVERLAY, patch() (+3 more)

### Community 24 - "Real Chat Runtime"
Cohesion: 0.23
Nodes (11): acorn, ASSETS, fs, functionExtentByName(), main(), MONO, monoName, parseOrThrow() (+3 more)

### Community 25 - "Transcript Publisher"
Cohesion: 0.17
Nodes (9): acorn, ASSETS, fs, path, PUBLISHER_IIFE, PUBLISHER_LINES, ROOT, threadFile (+1 more)

### Community 26 - "Side-by-Side Scheme"
Cohesion: 0.24
Nodes (11): fs, MAC_PLATFORMS, main(), occurrences(), patchPlatform(), path, { relPath, SRC_DIR }, targetFiles() (+3 more)

### Community 27 - "Development Launcher"
Cohesion: 0.17
Nodes (11): appRoot, arch, candidates, child, cliPath, electronBin, fs, os (+3 more)

### Community 28 - "Chat Catalog V4"
Cohesion: 0.22
Nodes (10): acorn, ASSETS, fs, functionExtentByName(), main(), MONO, monoName, path (+2 more)

### Community 29 - "Chat Picker Styling"
Cohesion: 0.24
Nodes (10): acorn, ASSETS, fs, functionExtentByName(), main(), MONO, monoName, path (+2 more)

### Community 30 - "Chat UX Runtime"
Cohesion: 0.22
Nodes (10): acorn, ASSETS, fs, functionExtentByName(), main(), MONO, monoName, path (+2 more)

### Community 31 - "Live Handoff Test"
Cohesion: 0.24
Nodes (10): APP, cdp(), fs, getJSON(), http, main(), OUT, path (+2 more)

### Community 32 - "Updater Patch"
Cohesion: 0.25
Nodes (10): collectMethodStates(), fs, { locateBundles, relPath, SRC_DIR }, locateTargets(), main(), { parse }, path, UPDATER_METHODS (+2 more)

### Community 33 - "Profile Isolation"
Cohesion: 0.29
Nodes (10): findBootstrap(), fs, main(), patchFile(), path, { relPath, SRC_DIR }, parseBundle(), patchBundle() (+2 more)

### Community 34 - "Statsig Mapping"
Cohesion: 0.20
Nodes (11): Statsig DJB2 Hash, Statsig Cloud-Control Mapping, aUn, Gate 2929582856: App Sunset Forced Update, index-MmO6ZWIv.js, patch-copyright.js, patch-devtools.js, patch-process-polyfill.js (+3 more)

### Community 35 - "Native Module Sync"
Cohesion: 0.22
Nodes (10): copyRecursive(), fs, hasNativeFiles(), MACOS_ONLY, main(), path, PROJECT_ROOT, ROOT_MODULES (+2 more)

### Community 36 - "Chat Catalog V3B"
Cohesion: 0.22
Nodes (9): acorn, ASSETS, fs, functionExtentByName(), MONO, monoName, path, replaceFn() (+1 more)

### Community 37 - "Chat Catalog V3C"
Cohesion: 0.22
Nodes (9): acorn, ASSETS, fs, functionExtentByName(), MONO, monoName, path, replaceFn() (+1 more)

### Community 38 - "Archive Delete Patch"
Cohesion: 0.31
Nodes (9): acorn, fs, hasNativeArchiveDelete(), { locateBundles, relPath, SRC_DIR }, main(), patchAppMain(), patchDataControls(), path (+1 more)

### Community 39 - "Work Mode Switching"
Cohesion: 0.22
Nodes (7): acorn, ASSETS, fs, MONO, monoName, path, ROOT

### Community 40 - "Copyright Patch"
Cohesion: 0.31
Nodes (8): collectPatches(), fs, { locateBundles, relPath }, main(), { parse }, path, walk(), locateBundles()

### Community 41 - "DevTools Patch"
Cohesion: 0.25
Nodes (7): fs, { locateBundles, relPath }, main(), { parse }, path, RULES, walkAST()

### Community 42 - "Fast Mode Patch"
Cohesion: 0.28
Nodes (8): collectPatches(), fs, { locateBundles, relPath, SRC_DIR }, main(), { parse }, path, walk(), SRC_DIR

### Community 43 - "Internationalization Patch"
Cohesion: 0.31
Nodes (8): collectPatches(), fs, { locateBundles, relPath, SRC_DIR }, locateTargets(), main(), { parse }, path, walk()

### Community 44 - "CLI Project Sync"
Cohesion: 0.22
Nodes (8): app, appState, cli, cliState, fs, KEYS, os, path

### Community 45 - "Patch Utilities"
Cohesion: 0.25
Nodes (6): acorn, _astCache, fs, parseBundleCached(), path, PROJECT_ROOT

### Community 46 - "Dynamic Config Catalog"
Cohesion: 0.25
Nodes (8): Dynamic Config 107580212: Model Configuration, Dynamic Config 1121645430: A/B Experiment Group, Dynamic Config 3210878109: Personality Configuration, Dynamic Configs, LZe, ZEe, zge, Gate 1444479692: personality

### Community 47 - "Version Bumping"
Cohesion: 0.33
Nodes (6): findUpstreamPkg(), fs, main(), path, ROOT_PKG, SRC_DIR

### Community 48 - "Patch Orchestration"
Cohesion: 0.40
Nodes (3): { execFileSync }, PATCHES, path

### Community 49 - "i18n Gate Layer"
Cohesion: 0.40
Nodes (5): jjt, tWn, Xkn, Layer 72216192: i18n Configuration, patch-i18n.js

### Community 50 - "Collaboration UI Gate"
Cohesion: 0.50
Nodes (4): jjn, mae, NRn, Gate 1060282072: Collaboration Mode UI

## Knowledge Gaps
- **406 isolated node(s):** `fs`, `path`, `acorn`, `ROOT`, `ASSETS` (+401 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `relPath()` connect `Profile Isolation` to `Canonical Mode Runtime`, `Updater Patch`, `Latest Model Patch`, `Archive Delete Patch`, `Copyright Patch`, `DevTools Patch`, `Fast Mode Patch`, `Internationalization Patch`, `Usage Controls`, `Plugin Authorization`, `Resource Saver`, `Patch Utilities`, `Side-by-Side Scheme`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `SRC_DIR` connect `Fast Mode Patch` to `Canonical Mode Runtime`, `Profile Isolation`, `Updater Patch`, `Latest Model Patch`, `Archive Delete Patch`, `Internationalization Patch`, `Usage Controls`, `Plugin Authorization`, `Resource Saver`, `Patch Utilities`, `Side-by-Side Scheme`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `parse()` connect `Usage Controls` to `Updater Patch`, `Profile Isolation`, `Latest Model Patch`, `Copyright Patch`, `DevTools Patch`, `Fast Mode Patch`, `Internationalization Patch`, `Plugin Authorization`, `Resource Saver`, `Chat History Overlay`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `parse()` (e.g. with `main()` and `main()`) actually correct?**
  _`parse()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `acorn` to the rest of the system?**
  _406 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Canonical Mode Runtime` be split into smaller, more focused modules?**
  _Cohesion score 0.08973172987974098 - nodes in this community are weakly interconnected._
- **Should `Upstream Build Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.08599033816425121 - nodes in this community are weakly interconnected._