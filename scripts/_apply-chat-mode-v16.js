#!/usr/bin/env node
/**
 * Pack extracted mac-x64 webview into live side-by-side Codex runtimes.
 *
 * Current invariants (v17):
 * - Work→Chat sticky switch + mode=chat navigation
 * - Chat models (Plus): 5.6 Sol / 5.6 Sol High / 5.5 Instant
 * - Work/Codex models (Plus): Sol / Terra / Luna via AppServer + tpp lists
 * - Send enable not blocked on tpp models-null / Ke workspace status
 * - Send button colors: Work blue, Codex red, Chat black
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const PAGE = path.join(ASSETS, "app-initial~app-main~page-ClBbNyfy.js");
const CSS = path.join(ASSETS, "app-Djw8ehxS.css");
const QC = path.join(ASSETS, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js");
const CATALOG = path.join(
  ASSETS,
  "app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~quick-ch~c6svlhqw-CWfXNvXw.js",
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function verify() {
  const page = fs.readFileSync(PAGE, "utf8");
  const css = fs.readFileSync(CSS, "utf8");
  const qc = fs.readFileSync(QC, "utf8");
  const catalog = fs.readFileSync(CATALOG, "utf8");
  assert(page.includes("native-chat-mode-v16"), "page missing v16 marker");
  assert(page.includes("CDRSetSticky(e)"), "page missing sticky state setter");
  assert(page.includes("sp.set(`mode`,`chat`)"), "page missing Chat mode=chat set");
  assert(!page.includes("if(e===`chat`){Iee(a,vf)"), "page still has broken Work→Chat branch");
  assert(qc.includes("codex-rebuild:submit-gate-v16"), "submit gate missing");
  assert(!qc.includes("ue===`tpp`&&Ee.data==null||Ke!=null"), "old submit hard-gate still present");
  assert(css.includes("native-chat-theme-v17"), "css missing v17 theme");
  assert(css.includes('data-codex-product-mode="work"') && css.includes("#2563eb"), "Work blue missing");
  assert(css.includes('data-codex-product-mode="codex"') && css.includes("#dc2626"), "Codex red missing");
  assert(css.includes('data-codex-product-mode="chat"') && css.includes("#111111"), "Chat black missing");
  assert(catalog.includes("selectedLabel:`5.6 Sol High`"), "catalog missing 5.6 Sol High");
  assert(catalog.includes("selectedLabel:`5.6 Sol`"), "catalog missing 5.6 Sol");
  assert(
    catalog.includes("async models(){return(e=>{const t=[") &&
      catalog.includes("return{...e,defaultModelSlug:`gpt-5.6-sol`,options:t}}"),
    "Chat models must be exclusive Sol/Instant list",
  );
  assert(catalog.includes("modelLabel:`5.6 Terra`"), "Work/Codex terra list missing");
  assert(catalog.includes("model:`gpt-5.6-luna`") || catalog.includes("gpt-5.6-luna"), "Work/Codex luna missing");
  console.log("verify ok");
}

function packAndInstall() {
  const packed = path.join(ROOT, "out", "app-chat-mode-v17.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  console.log("packing", packed);
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });

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
    const bak = `${dest}.bak-v17-${Date.now()}`;
    fs.copyFileSync(dest, bak);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
    console.log("backup", bak);
  }
}

verify();
if (!process.argv.includes("--check")) {
  packAndInstall();
}
console.log("done");
