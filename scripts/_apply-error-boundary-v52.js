#!/usr/bin/env node
"use strict";
/**
 * v52a: Make App error boundary show+stash real error so we can fix thread-open crash.
 * Then v52b will fix the actual bug once identified.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const MARKER = "codex-rebuild:error-boundary-v52";

const MAIN = path.join(ASSETS, "app-main-CBwHZrMR.js");
const JJ = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("jj50pjos") && f.endsWith(".js")),
);
const PAGE = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("ogh9jurw") && f.endsWith(".js")),
);

const LIVE = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

function assert(c, m) {
  if (!c) throw new Error(m);
}
function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1 got ${n}`);
  return src.replace(from, to);
}
function parseOk(label, src) {
  try {
    acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error(label + ": " + e.message);
  }
}
function killCodex() {
  try {
    execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true", { stdio: "ignore" });
  } catch {}
}

let main = fs.readFileSync(MAIN, "utf8");
let jj = fs.readFileSync(JJ, "utf8");
let page = fs.readFileSync(PAGE, "utf8");

// 1) app-main: function fallback that shows error text
const badFb = "fallback:(0,K.jsx)(re,{})";
assert(main.includes(badFb) || main.includes(MARKER), "fallback anchor missing");
if (main.includes(badFb)) {
  const goodFb =
    "fallback:e=>{try{localStorage.setItem(`cdr-last-error`,JSON.stringify({at:Date.now(),message:String(e&&e.error&&e.error.message||e),stack:String(e&&e.error&&e.error.stack||``),componentStack:String(e&&e.componentStack||``)}))}catch{}try{console.error(`[cdr] App error boundary`,e&&e.error||e)}catch{}return(0,K.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,alignItems:`center`,justifyContent:`center`,height:`100%`,gap:`12px`,padding:`24px`,fontFamily:`ui-sans-serif,system-ui`},children:[(0,K.jsx)(re,{}),(0,K.jsx)(`pre`,{style:{maxWidth:`900px`,whiteSpace:`pre-wrap`,fontSize:`12px`,opacity:.85},children:String(e&&e.error&&(e.error.stack||e.error.message)||e)})]})}/* " +
    MARKER +
    ":fb */";
  // Need K.jsxs available - K is jsx runtime. Check if jsxs exists as K.jsxs
  if (!main.includes("K.jsxs") && main.includes("(0,K.jsx)")) {
    // use Fragment via multiple - simpler approach: only stash + enhance re via props won't work since re ignores props.
    // Just stash and call re, then user/CDP reads localStorage. ALSO mutate document title.
    const simple =
      "fallback:e=>{try{localStorage.setItem(`cdr-last-error`,JSON.stringify({at:Date.now(),message:String(e&&e.error&&e.error.message||``),stack:String(e&&e.error&&e.error.stack||``),componentStack:String(e&&e.componentStack||``)}))}catch{}try{document.title=`CDR ERR: `+String(e&&e.error&&e.error.message||e).slice(0,120)}catch{}try{console.error(`[cdr] App error boundary`,e&&e.error||e)}catch{}return(0,K.jsx)(re,{})}/* " +
      MARKER +
      ":fb */";
    main = replaceOnce(main, badFb, simple, "function fallback");
  } else {
    main = replaceOnce(main, badFb, goodFb, "function fallback");
  }
}

// 2) jj50: also stash in componentDidCatch
const badCatch =
  "try{ee.error(`error boundary`,{safe:{name:this.props.name},sensitive:{error:e,componentStack:t??``}})}catch{}this.setState({error:r,componentStack:t,eventId:i})";
if (jj.includes(badCatch) && !jj.includes(MARKER)) {
  const goodCatch =
    "try{ee.error(`error boundary`,{safe:{name:this.props.name},sensitive:{error:e,componentStack:t??``}})}catch{}try{localStorage.setItem(`cdr-last-error`,JSON.stringify({at:Date.now(),name:this.props.name,message:String(r&&r.message||r),stack:String(r&&r.stack||``),componentStack:n}))}catch{}/* " +
    MARKER +
    ":catch */this.setState({error:r,componentStack:t,eventId:i})";
  jj = replaceOnce(jj, badCatch, goodCatch, "didCatch stash");
}

// 3) Find sae - dump for later
const saeIdx = page.search(/function sae\(|sae=function|sae=(e|,|t)/);
console.log("saeIdx", saeIdx);
if (saeIdx >= 0) console.log(page.slice(saeIdx, saeIdx + 500));
else {
  const i = page.indexOf("sae(");
  console.log("sae call", page.slice(Math.max(0, i - 100), i + 200));
  // find definition via "sae="
  const j = page.lastIndexOf("sae=", i);
  console.log("sae= near", page.slice(Math.max(0, j - 50), j + 400));
}

parseOk("main", main);
parseOk("jj", jj);
fs.writeFileSync(MAIN, main);
fs.writeFileSync(JJ, jj);
console.log("wrote sources");

if (process.argv.includes("--check")) process.exit(0);

killCodex();
const packed = path.join(ROOT, "out", "app-error-boundary-v52.asar");
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
for (const dest of LIVE) {
  if (!fs.existsSync(dest)) continue;
  fs.copyFileSync(dest, `${dest}.bak-pre-v52-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}
execFileSync("node", [path.join(ROOT, "scripts/_resign-live-runtime.js")], {
  cwd: ROOT,
  stdio: "inherit",
});
console.log("DONE v52a error boundary instrumentation");
