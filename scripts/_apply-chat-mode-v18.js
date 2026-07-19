#!/usr/bin/env node
/**
 * Verify + pack/install Chat mode v18 fixes:
 * - CDRChatHome passes chatMode:!0
 * - Sticky Chat forces ChatGPT model catalog (Sol High/Medium/Terra/Luna)
 * - Codex→Chat handoff sync navigate with seed/auto-submit
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const PAGE = path.join(ASSETS, "app-initial~app-main~page-ClBbNyfy.js");
const QC = path.join(ASSETS, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js");
const CATALOG = path.join(
  ASSETS,
  "app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~quick-ch~c6svlhqw-CWfXNvXw.js",
);
const REMOTE = path.join(
  ASSETS,
  "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js",
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function verify() {
  const page = fs.readFileSync(PAGE, "utf8");
  const qc = fs.readFileSync(QC, "utf8");
  const catalog = fs.readFileSync(CATALOG, "utf8");
  const remote = fs.readFileSync(REMOTE, "utf8");
  assert(page.includes("native-chat-mode-v18"), "page missing v18");
  assert(page.includes("T0,{chatMode:!0}"), "CDRChatHome missing chatMode");
  assert(qc.includes("CDRChatSticky?pe:"), "composer missing chat sticky model source");
  assert(catalog.includes("chat-catalog-v5:merge"), "catalog missing v5 merge");
  assert(catalog.includes("selectedLabel:`5.6 Sol High`"), "missing 5.6 Sol High");
  assert(catalog.includes("selectedLabel:`5.6 Terra`"), "missing 5.6 Terra");
  assert(catalog.includes("selectedLabel:`5.6 Luna`"), "missing 5.6 Luna");
  assert(remote.includes("chat-codex-handoff-v18"), "handoff missing v18");
  assert(remote.includes("r(`/chat?mode=chat`,{state:{prefillPrompt:seed"), "handoff sync navigate missing");
  console.log("verify ok");
}

function packAndInstall() {
  const packed = path.join(ROOT, "out", "app-chat-mode-v18.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  console.log("packing", packed);
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
  const live = [
    path.join(
      process.env.HOME,
      "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
    ),
    "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
  ];
  for (const dest of live) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    const bak = `${dest}.bak-v18-${Date.now()}`;
    fs.copyFileSync(dest, bak);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
    console.log("backup", bak);
  }
}

verify();
if (!process.argv.includes("--check")) packAndInstall();
console.log("done");
