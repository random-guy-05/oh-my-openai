#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  CHAT_PARTITION,
  MAIN_MARKER,
  RENDERER_MARKER,
  atomicReplaceEntries,
  countOccurrences,
  patchMain,
  patchRenderer,
  recoverAtomicTransaction,
  replaceExactly,
  verifyMain,
  verifyRenderer,
} = require("./patch-dedicated-chat-mode");

const ROOT = path.resolve(__dirname, "..");
const PLATFORM_ROOT = path.join(ROOT, "src", "mac-x64", "_asar");

function findOne(directory, predicate, label) {
  const matches = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(directory, name))
    .filter((file) => predicate(fs.readFileSync(file, "utf8")));
  assert.strictEqual(matches.length, 1, `${label}: expected one candidate, found ${matches.length}`);
  return matches[0];
}

assert.strictEqual(countOccurrences("one two one", "one"), 2);
assert.strictEqual(replaceExactly("a-b", "-", ":", "unit"), "a:b");
assert.throws(() => replaceExactly("abc", "z", "x", "missing"), /expected 1 anchor/);
assert.throws(() => replaceExactly("xx", "x", "y", "duplicate"), /found 2/);

const cleanRendererFixture = `
var UF,WF=e((()=>{$(),at(),UF=Pt(q,!1)}));
function bDe(){}
function WDe({n,r}){return r===\`codex\`&&n?(0,RF.jsx)(bDe,{}):null}
function XDe(){return \`sidebarElectron.productMode.chatGptWork.plainText\`}
function LAe(){let u=Xm(\`824038554\`);let k=gg(O),A=Rh(),j=br(Qe.conversationDetailMode),F=\`coding\`,I=j==null&&F===\`non_coding\`||A===\`STEPS_PROSE\`?\`work\`:\`codex\`;return{onModeSelect:e=>{ooe(a,e===\`work\`?Zm:zoe)}}}
function WAe(){return null}
`;
const cleanMainFixture = `
function MR(e){try{return new URL(e).origin===hR}catch{return!1}}
function aB(){let s={},n={Ba(){return null},session:null};if(n.Ba(s.partition)!=null||oz(s))return;if(Zz(n.session)||sz(n))return}
function host(){let O=!0,o=\`primary\`,N={isDestroyed(){return!1},send(){}};O&&(o===\`primary\`&&cz({onReturnToCodex:()=>{N.isDestroyed()||N.send(B,{type:\`navigate-back\`})},owner:N}))}
`;
const rendererFixturePath = path.join(ROOT, "fixture-renderer.js");
const mainFixturePath = path.join(ROOT, "fixture-main.js");
const cleanRendererOnce = patchRenderer(cleanRendererFixture, rendererFixturePath);
const cleanMainOnce = patchMain(cleanMainFixture, mainFixturePath);
assert.strictEqual(cleanRendererOnce.changed, true, "clean renderer fixture must patch on first pass");
assert.strictEqual(cleanMainOnce.changed, true, "clean main fixture must patch on first pass");
assert.strictEqual(patchRenderer(cleanRendererOnce.source, rendererFixturePath).changed, false);
assert.strictEqual(patchMain(cleanMainOnce.source, mainFixturePath).changed, false);

const atomicDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chat-patch-test-"));
try {
  const first = path.join(atomicDir, "webview", "assets", "renderer.js");
  const second = path.join(atomicDir, ".vite", "build", "main.js");
  fs.mkdirSync(path.dirname(first), { recursive: true });
  fs.mkdirSync(path.dirname(second), { recursive: true });
  fs.writeFileSync(first, "old-renderer");
  fs.writeFileSync(second, "old-main");
  atomicReplaceEntries([
    { path: first, previous: "old-renderer", next: "new-renderer", verify: (value) => assert.strictEqual(value, "new-renderer") },
    { path: second, previous: "old-main", next: "new-main", verify: (value) => assert.strictEqual(value, "new-main") },
  ], { transactionRoot: atomicDir });
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-renderer");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "new-main");

  assert.throws(() => atomicReplaceEntries([
    { path: first, previous: "new-renderer", next: "broken-renderer", verify: () => {} },
    { path: second, previous: "new-main", next: "broken-main", verify: () => { throw new Error("staged rejection"); } },
  ], { transactionRoot: atomicDir }), /staged rejection/);
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-renderer");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "new-main");

  const journalPath = path.join(atomicDir, ".dedicated-chat-transaction.json");
  const originalUnlinkSync = fs.unlinkSync;
  const originalFsyncSync = fs.fsyncSync;
  let journalUnlinked = false;
  fs.unlinkSync = (filePath) => {
    const result = originalUnlinkSync(filePath);
    if (filePath === journalPath) journalUnlinked = true;
    return result;
  };
  fs.fsyncSync = (descriptor) => {
    if (journalUnlinked && fs.fstatSync(descriptor).isDirectory()) {
      journalUnlinked = false;
      throw new Error("injected commit-dir fsync failure");
    }
    return originalFsyncSync(descriptor);
  };
  try {
    assert.throws(() => atomicReplaceEntries([
      { path: first, previous: "new-renderer", next: "committed-renderer", verify: (value) => assert.strictEqual(value, "committed-renderer") },
      { path: second, previous: "new-main", next: "committed-main", verify: (value) => assert.strictEqual(value, "committed-main") },
    ], { transactionRoot: atomicDir }), /injected commit-dir fsync failure/);
  } finally {
    fs.unlinkSync = originalUnlinkSync;
    fs.fsyncSync = originalFsyncSync;
  }
  assert.strictEqual(fs.readFileSync(first, "utf8"), "committed-renderer");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "committed-main");
  const firstBackup = fs.readdirSync(path.dirname(first))
    .map((name) => path.join(path.dirname(first), name))
    .find((filePath) => filePath.includes(".dedicated-chat-") && filePath.endsWith(".backup"));
  const secondBackup = fs.readdirSync(path.dirname(second))
    .map((name) => path.join(path.dirname(second), name))
    .find((filePath) => filePath.includes(".dedicated-chat-") && filePath.endsWith(".backup"));
  assert.ok(firstBackup, "renderer recovery backup was discarded after failed journal-unlink fsync");
  assert.ok(secondBackup, "main recovery backup was discarded after failed journal-unlink fsync");
  fs.writeFileSync(journalPath, JSON.stringify({
    version: 1,
    entries: [
      { path: first, backupPath: firstBackup },
      { path: second, backupPath: secondBackup },
    ],
  }));
  assert.strictEqual(recoverAtomicTransaction(atomicDir), true);
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-renderer");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "new-main");

  const simulatedFirstBackup = `${first}.simulated.backup`;
  const simulatedSecondBackup = `${second}.simulated.backup`;
  fs.writeFileSync(simulatedFirstBackup, "new-renderer");
  fs.writeFileSync(simulatedSecondBackup, "new-main");
  fs.writeFileSync(first, "partially-installed-renderer");
  fs.writeFileSync(journalPath, JSON.stringify({
    version: 1,
    entries: [
      { path: first, backupPath: simulatedFirstBackup },
      { path: second, backupPath: simulatedSecondBackup },
    ],
  }));
  assert.strictEqual(recoverAtomicTransaction(atomicDir), true);
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-renderer");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "new-main");
  assert.ok(!fs.existsSync(journalPath));
} finally {
  fs.rmSync(atomicDir, { recursive: true, force: true });
}

const rendererPath = findOne(
  path.join(PLATFORM_ROOT, "webview", "assets"),
  (source) => source.includes("sidebarElectron.productMode.chatGptWork.plainText") &&
    (source.includes("function XDe(") || source.includes(RENDERER_MARKER)),
  "renderer",
);
const mainPath = findOne(
  path.join(PLATFORM_ROOT, ".vite", "build"),
  (source) => source.includes("Authenticated ChatGPT webview target must be ChatGPT") &&
    (source.includes("function aB(") || source.includes(MAIN_MARKER)),
  "main process",
);

const rendererInput = fs.readFileSync(rendererPath, "utf8");
const mainInput = fs.readFileSync(mainPath, "utf8");
const rendererOnce = patchRenderer(rendererInput, rendererPath);
const mainOnce = patchMain(mainInput, mainPath);
verifyRenderer(rendererOnce.source, rendererPath);
verifyMain(mainOnce.source, mainPath);

const rendererTwice = patchRenderer(rendererOnce.source, rendererPath);
const mainTwice = patchMain(mainOnce.source, mainPath);
assert.strictEqual(rendererTwice.changed, false, "renderer patch must be idempotent");
assert.strictEqual(mainTwice.changed, false, "main patch must be idempotent");
assert.strictEqual(rendererTwice.source, rendererOnce.source, "second renderer patch changed bytes");
assert.strictEqual(mainTwice.source, mainOnce.source, "second main patch changed bytes");

assert.strictEqual(countOccurrences(rendererOnce.source, CHAT_PARTITION), 1);
assert.strictEqual(countOccurrences(mainOnce.source, `CDR_CHAT_PARTITION=\`${CHAT_PARTITION}\``), 1);
assert.ok(rendererOnce.source.includes("function bDe()"), "Quick Chat internals should remain");
assert.ok(!rendererOnce.source.includes("r===`codex`&&n?(0,RF.jsx)(bDe,{}):null"));

const unsafeMain = mainOnce.source.replace(
  "contextIsolation:!0,webSecurity:!0",
  "contextIsolation:!1,webSecurity:!0",
);
assert.notStrictEqual(unsafeMain, mainOnce.source, "security mutation fixture did not match");
assert.throws(() => verifyMain(unsafeMain, mainPath), /hardening/);

const overriddenMain = mainOnce.source.replace(
  "disablePopups:!0,spellcheck:!0})}",
  "disablePopups:!0,spellcheck:!0}),t.contextIsolation=!1}",
);
assert.notStrictEqual(overriddenMain, mainOnce.source, "late override fixture did not match");
assert.throws(() => verifyMain(overriddenMain, mainPath), /hardening function differs/);

const mismatchedRenderer = rendererOnce.source.replace(CHAT_PARTITION, `${CHAT_PARTITION}-wrong`);
assert.throws(() => verifyRenderer(mismatchedRenderer, rendererPath), /persist:codex-chatgpt-live/);

const shadowedRenderer = rendererOnce.source
  .replace("u=()=>{try{String(e.getURL?.()", "i=()=>{try{String(e.getURL?.()")
  .replaceAll("did-stop-loading`,u)", "did-stop-loading`,i)")
  .replaceAll("did-finish-load`,u)", "did-finish-load`,i)")
  .replace("),u(),()=>{", "),i(),()=>{");
assert.notStrictEqual(shadowedRenderer, rendererOnce.source, "callback-shadow fixture did not match");
assert.throws(() => verifyRenderer(shadowedRenderer, rendererPath), /shadows its state binding/);

const occludedMenuRenderer = rendererOnce.source.replace(
  "min-height:220px!important",
  "min-height:48px!important",
);
assert.notStrictEqual(occludedMenuRenderer, rendererOnce.source, "occluded-menu fixture did not match");
assert.throws(() => verifyRenderer(occludedMenuRenderer, rendererPath), /lacks webview menu clearance/);

const buriedMenuRenderer = rendererOnce.source.replace(
  "z-index:2147483647!important",
  "z-index:50!important",
);
assert.notStrictEqual(buriedMenuRenderer, rendererOnce.source, "buried-menu fixture did not match");
assert.throws(() => verifyRenderer(buriedMenuRenderer, rendererPath), /lacks webview menu clearance/);

const noSelector = rendererOnce.source.replace(
  "onSelect:()=>t(`chat`)",
  "onSelect:()=>t(`codex`)",
);
assert.notStrictEqual(noSelector, rendererOnce.source, "selector mutation fixture did not match");
assert.throws(() => verifyRenderer(noSelector, rendererPath), /three-way mode selector/);

console.log("[ok] dedicated Chat patch structural, security, and idempotency tests passed");
