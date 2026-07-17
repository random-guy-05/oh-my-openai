const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ASSETS =
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets";
const ASAR_ROOT =
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar";
const REBUILD =
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const page = path.join(ASSETS, "app-initial~app-main~page-ClBbNyfy.js");
const src = fs.readFileSync(page, "utf8");

const checks = {
  v14: src.includes("native-chat-mode-v14"),
  deniedGate: src.includes("if(o===`denied`)return(0,g0.jsx)(I1,{})"),
  jueDenied: src.includes("(n??t)===`denied`"),
  noLoadingWait: !src.includes("if(o===`loading`)return null;if(o!==`allowed`)"),
  noOldJue: !src.includes("(n??t)===`allowed`&&r"),
  noYueLoading: !src.includes("if(n===`loading`)return null;if(n===`denied`)"),
};
console.log(checks);
if (!checks.v14 || !checks.deniedGate || !checks.jueDenied || !checks.noLoadingWait || !checks.noOldJue) {
  throw new Error("v14 loading-gate fix incomplete in page bundle");
}

// Drop interrupted transaction leftovers without reverting live files.
const journal = path.join(ASAR_ROOT, ".native-chat-transaction.json");
if (fs.existsSync(journal)) fs.unlinkSync(journal);
for (const name of fs.readdirSync(ASSETS)) {
  if (name.includes(".native-chat-")) {
    fs.unlinkSync(path.join(ASSETS, name));
    console.log("removed", name);
  }
}

const packed = path.join(REBUILD, "out", "app-chat-continuity-v14.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
console.log("packing...");
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
  cwd: REBUILD,
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
  const bak = `${dest}.bak-v14-${Date.now()}`;
  fs.copyFileSync(dest, bak);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}

console.log("done pack/install");
