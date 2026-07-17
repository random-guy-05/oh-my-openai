#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parse } = require("acorn");
const {
  CHAT_HOME_ROUTE,
  CSS_MARKER,
  HOME_MARKER,
  PAGE_MARKER,
  atomicReplaceEntries,
  countOccurrences,
  locateTargets,
  patchCss,
  patchPage,
  patchWorkHome,
  recoverAtomicTransaction,
  replaceExactly,
  verifyCss,
  verifyPage,
  verifyWorkHome,
} = require("./patch-dedicated-chat-mode");

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const [key, child] of Object.entries(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item?.type) walk(item, visitor);
      }
    } else if (child?.type) {
      walk(child, visitor);
    }
  }
}

function functionReader(source, filePath) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const functions = new Map();
  walk(ast, (node) => {
    if (node.type !== "FunctionDeclaration" || !node.id?.name) return;
    const matches = functions.get(node.id.name) ?? [];
    matches.push(source.slice(node.start, node.end));
    functions.set(node.id.name, matches);
  });
  return (name) => {
    const matches = functions.get(name) ?? [];
    assert.strictEqual(
      matches.length,
      1,
      `${path.basename(filePath)}: expected one function ${name}, found ${matches.length}`,
    );
    return matches[0];
  };
}

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label}: missing ${needle}`);
}

function replaceOne(source, needle, replacement, label) {
  assert.strictEqual(
    countOccurrences(source, needle),
    1,
    `${label}: tamper anchor must occur exactly once`,
  );
  return source.replace(needle, replacement);
}

function assertNoTransactionArtifacts(root) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else {
        assert.ok(
          !entry.name.includes(".native-chat-") &&
            entry.name !== ".native-chat-transaction.json",
          `transaction artifact was not cleaned up: ${entryPath}`,
        );
      }
    }
  }
}

assert.strictEqual(countOccurrences("one two one", "one"), 2);
assert.strictEqual(replaceExactly("a-b", "-", ":", "unit"), "a:b");
assert.throws(() => countOccurrences("abc", ""), /empty anchor/);
assert.throws(() => replaceExactly("abc", "z", "x", "missing"), /expected 1 anchor/);
assert.throws(() => replaceExactly("xx", "x", "y", "duplicate"), /found 2/);

const targets = locateTargets("mac-x64");
assert.ok(
  targets.assets.endsWith(path.join("src", "mac-x64", "_asar", "webview", "assets")),
  "native Chat targets were not located in the Intel 91948 renderer assets",
);
assert.ok(path.basename(targets.page.path).startsWith("app-initial~app-main~page-"));
assert.ok(path.basename(targets.home.path).startsWith("work-home-page-"));
assert.ok(path.basename(targets.css.path).startsWith("app-"));
assertIncludes(targets.page.source, "function ROe(", "official page target");
assertIncludes(targets.page.source, "function mje(", "official page target");
assertIncludes(targets.home.source, "chatgptConversations.home.hero", "official Work home target");
assertIncludes(targets.css.source, "#root{height:100vh}", "official global theme target");
assert.throws(() => locateTargets("mac-arm64"), /supports only mac-x64 26\.707\.91948/);

const pageOnce = patchPage(targets.page.source, targets.page.path);
const homeOnce = patchWorkHome(targets.home.source, targets.home.path);
const cssOnce = patchCss(targets.css.source, targets.css.path);
assert.strictEqual(
  pageOnce.changed,
  !targets.page.source.includes(PAGE_MARKER),
  "page first-pass change state is inconsistent",
);
assert.strictEqual(
  homeOnce.changed,
  !targets.home.source.includes(HOME_MARKER),
  "home first-pass change state is inconsistent",
);
assert.strictEqual(
  cssOnce.changed,
  targets.css.source.includes(CSS_MARKER) || targets.css.source.includes('data-codex-product-mode="chat"'),
  "CSS first-pass change state is inconsistent",
);
verifyPage(pageOnce.source, targets.page.path);
verifyWorkHome(homeOnce.source, targets.home.path);
verifyCss(cssOnce.source, targets.css.path);

const pageTwice = patchPage(pageOnce.source, targets.page.path);
const homeTwice = patchWorkHome(homeOnce.source, targets.home.path);
const cssTwice = patchCss(cssOnce.source, targets.css.path);
for (const [label, once, twice] of [
  ["page", pageOnce, pageTwice],
  ["home", homeOnce, homeTwice],
  ["CSS", cssOnce, cssTwice],
]) {
  assert.strictEqual(twice.changed, false, `${label} patch must be idempotent`);
  assert.strictEqual(twice.source, once.source, `${label} second pass changed bytes`);
}

const pageFunction = functionReader(pageOnce.source, targets.page.path);
const selector = pageFunction("ROe");
for (const mode of ["work", "codex", "chat"]) {
  assert.strictEqual(
    countOccurrences(selector, `onSelect:()=>t(\`${mode}\`)`),
    1,
    `selector must expose exactly one ${mode} option`,
  );
}
assertIncludes(selector, "children:[o,s,l]", "three-mode selector menu");
assertIncludes(selector, "e===`chat`?`Chat`", "Chat selector label");

const shell = pageFunction("mje");
const expectedModeCallback =
  `onModeSelect:e=>{if(e===\`chat\`){CDRChatNavigate(\`${CHAT_HOME_ROUTE}\`);return}` +
  "Iee(a,e===`work`?vf:Tr),CDRChatMode&&CDRChatNavigate(`/`)}";
assertIncludes(shell, expectedModeCallback, "Chat mode route callback");
assert.strictEqual(
  countOccurrences(shell, "Iee(a,e===`work`?vf:Tr)"),
  1,
  "only Codex and ChatGPT Work may update conversationDetailMode",
);
assert.ok(
  !/Iee\([^)]*(?:`chat`|CDRChatMode)/.test(shell),
  "Chat must never be passed to conversationDetailMode",
);
const callbackStart = shell.indexOf("onModeSelect:e=>{");
const callbackEnd = shell.indexOf("}}),(0,iz.jsx)(vOe", callbackStart);
assert.ok(callbackStart >= 0 && callbackEnd > callbackStart, "mode callback could not be isolated");
const modeCallback = shell.slice(callbackStart, callbackEnd);
for (const mutationWord of ["archive", "delete", "rename", "create", "migrate"]) {
  assert.ok(
    !modeCallback.toLowerCase().includes(mutationWord),
    `mode switch callback unexpectedly contains ${mutationWord} behavior`,
  );
}
assertIncludes(pageOnce.source, "path:`/chat`", "native Chat home route");
assertIncludes(shell, "CDRChatQueryClient=Yc()", "account-scoped Chat query client");
assertIncludes(shell, "CDRChatQueryClient.removeQueries({type:`inactive`})", "inactive account cache purge");
assertIncludes(shell, "CDRChatQueryClient.resetQueries({type:`active`})", "active account observer reset");
assertIncludes(shell, "CDRChatAccountChanging=CDRChatSettledAccount!==o", "account-change guard");
assertIncludes(shell, "rz.useLayoutEffect)(()=>{CDRChatAccountChanging&&", "pre-paint account cache isolation");
assertIncludes(shell, "CDRChatMode&&CDRChatAccountChanging?null:", "two-phase Chat history gate");
assertIncludes(
  shell,
  "CDRChatMode?`chat:${CDRChatSettledAccount??`anonymous`}`:`codex`",
  "account-keyed Chat history remount",
);
assert.ok(
  shell.indexOf("CDRChatMode&&CDRChatAccountChanging?null:") < shell.indexOf("(0,iz.jsx)(IAe"),
  "Chat history mounts before account cache isolation settles",
);
assert.ok(
  shell.indexOf("removeQueries({type:`inactive`})") < shell.indexOf("resetQueries({type:`active`})") &&
    shell.indexOf("resetQueries({type:`active`})") < shell.indexOf("CDRChatSetSettledAccount(o)"),
  "account cache isolation must purge inactive queries, reset active observers, then settle",
);
assertIncludes(shell, "CDRChatLocation=ce()", "React Router location hook");
assert.ok(!shell.includes("let ce;"), "sidebar cache binding shadows the location hook");

const newChat = pageFunction("NOe");
assertIncludes(newChat, `n(\`${CHAT_HOME_ROUTE}\`)`, "Chat new-conversation route");
assertIncludes(newChat, "chatMode:t", "Chat-aware new button");

const nav = pageFunction("MOe");
assert.ok(!nav.includes("cOe"), "standalone Quick Chat row still renders in the native nav");
for (const guard of [
  "r!==`chat`&&b?",
  "r!==`chat`&&_&&v!==`project`?",
  "t&&r!==`chat`&&",
  "r!==`chat`&&x?",
  "r===`chat`||_?null:",
  "r===`chat`?null:",
]) {
  assert.ok(!nav.includes(guard), `Chat must not hide Work nav chrome: ${guard}`);
}
assertIncludes(shell, "sidebarMode:CDRChatMode?`work`:`codex`", "Chat reuses Work sidebar chrome");
assert.ok(!shell.includes("sidebarMode:CDRChatMode?`chat`"), "Chat must not use a separate sidebarMode");
assert.ok(!shell.includes("data-codex-product-mode"), "Chat must not set a Chat-only product theme attribute");
for (const legacy of [
  "codex-rebuild:dedicated-chat-mode-v7",
  "persist:codex-chatgpt-live",
  "CodexDedicatedChatSurface",
]) {
  assert.ok(!pageOnce.source.includes(legacy), `legacy webview implementation remains: ${legacy}`);
}

const historyHost = pageFunction("IAe");
assertIncludes(
  historyHost,
  "if(CDRChatMode)R=[(0,yR.jsx)(eAe,{chatMode:!0},`chat`)];",
  "Chat history branch",
);
const history = pageFunction("eAe");
assertIncludes(
  history,
  "CDRChatSource=Jhe({tppOnly:!CDRChatMode})",
  "non-TPP ChatGPT history query",
);
assertIncludes(
  history,
  "chatTargets:CDRChatSource.chatTargets.map(e=>({...e,route:`${e.route}?mode=chat`}))",
  "Chat conversation presentation routes",
);
assertIncludes(
  history,
  "pinnedTargets:CDRChatSource.pinnedTargets.map(e=>({...e,route:`${e.route}?mode=chat`}))",
  "pinned Chat conversation presentation routes",
);
assert.ok(!/\be\.route\s*=/.test(history), "Chat routing must clone targets instead of mutating them");
assert.ok(
  countOccurrences(history, "visibleProjects.map") >= 3,
  "Chat mode must include visible projects in ordering, lookup, and display keys",
);
assertIncludes(history, "isPinned:!1,project:e", "non-pinned ChatGPT projects");
assertIncludes(history, "e.startsWith(`chatgpt:`)", "Chat history key filter");
assertIncludes(history, "heading:`Tasks`", "Work history heading shared with Chat");
assert.ok(!history.includes("heading:CDRChatMode?`Chats`"), "Chat must not rename Tasks to Chats");
assert.ok(!history.includes("if(CDRChatMode)te=G"), "Chat must keep Work history sections");
assertIncludes(history, "allowCodexThreadProjectDrag:!CDRChatMode", "cross-backend drag isolation");
assertIncludes(
  historyHost,
  "F=CDRChatMode||l===`STEPS_PROSE`?`work`:`codex`",
  "Chat reuses Work scroll namespace",
);
assert.strictEqual(
  countOccurrences(history, "chatGptSource:E,chatMode:CDRChatMode"),
  2,
  "both Chat history sections must pass mode into project rows",
);

const projectRows = pageFunction("OL");
assertIncludes(projectRows, "chatMode:CDRChatMode=!1", "Chat project-list prop");
assertIncludes(projectRows, "chatMode:CDRChatMode,expandable:!0", "expandable ChatGPT project rows");
assertIncludes(projectRows, "let R=(e,t)=>", "mode-safe project row renderer");
const project = pageFunction("Fke");
assertIncludes(project, "chatMode:CDRChatMode=!1", "Chat project prop");
assertIncludes(project, "item:e,chatMode:CDRChatMode", "nested project row mode");
assertIncludes(project, "a&&Zre", "project folder expansion behavior");
const pristineProjectRow = functionReader(targets.page.source, targets.page.path)("Uke");
assert.ok(!/\b[ei]\.route\b/.test(pristineProjectRow), "pristine project items unexpectedly expose a route");
assert.strictEqual(countOccurrences(pristineProjectRow, "dt(i.conversation"), 2, "pristine project row route shape changed");
const projectRow = pageFunction("Uke");
assertIncludes(projectRow, "chatMode:CDRChatMode=!1", "nested project Chat prop");
assertIncludes(projectRow, "CDRChatRoute=e=>CDRChatMode?", "nested project route decorator");
assert.strictEqual(
  countOccurrences(projectRow, "CDRChatRoute(dt(i.conversation"),
  2,
  "optimistic and server project chats must both preserve Chat mode",
);
assert.ok(!/\b[ei]\.route\b/.test(projectRow), "nested route patch assumes project items contain routes");

const chatHome = pageFunction("CDRChatHome");
assertIncludes(chatHome, "children:(0,g0.jsx)(T0,{chatMode:!0},\"chat:\"+(n??\"anonymous\"))", "native Chat home");
assertIncludes(chatHome, "{accountId:e}=u_()", "account-keyed Chat home");
assertIncludes(chatHome, "if(i)return null", "two-phase Chat home account gate");
assertIncludes(chatHome, "o=Q(VS)??a", "Chat home prefers store status");
assertIncludes(chatHome, "if(o===`loading`)return null", "Chat home waits while loading");
assertIncludes(chatHome, "if(o!==`allowed`)return(0,g0.jsx)(I1,{})", "Chat home keeps denied fallback");
assert.ok(!chatHome.includes("if((o??a)!==`allowed`)"), "Chat home must not treat loading as an error");
assertIncludes(chatHome, "t.removeQueries({type:`inactive`})", "Chat home inactive cache purge");
assertIncludes(chatHome, "t.resetQueries({type:`active`})", "Chat home active observer reset");
assert.ok(
  chatHome.indexOf("if(i)return null") < chatHome.indexOf("(0,g0.jsx)(T0"),
  "Chat home mounts before account cache isolation settles",
);

assertIncludes(
  pageOnce.source,
  "color:n.project.gizmo.display?.theme,fallbackIcon:(0,jL.jsx)(TD,{className:`icon-xs`}),icon:n.project.gizmo.display?.emoji}),label:(n.project.gizmo.display?.name??``).trim()||n.project.gizmo.id",
  "safe ChatGPT project drag display",
);
assertIncludes(pageOnce.source, "color:u.gizmo.display?.theme", "safe ChatGPT project row theme");
assertIncludes(
  pageOnce.source,
  "function Jke(e){return (e.gizmo.display?.name??``).trim()||e.gizmo.id}",
  "safe ChatGPT project title",
);
assert.ok(!pageOnce.source.includes("n.project.gizmo.display.theme"), "OL must not read display.theme unsafely");
assert.ok(!pageOnce.source.includes("u.gizmo.display.theme"), "Fke must not read display.theme unsafely");
assert.ok(!pageOnce.source.includes("e.gizmo.display.name.trim()"), "Jke must not read display.name unsafely");

const homeFunction = functionReader(homeOnce.source, targets.home.path)("j");
assertIncludes(homeFunction, "chatMode:CDRChatMode=!1", "Chat home prop");
assertIncludes(
  homeFunction,
  "conversationOrigin:CDRChatMode?null:`tpp`",
  "non-TPP Chat model/backend selection",
);
assertIncludes(
  homeFunction,
  "CDRChatMode?`?mode=chat`:``",
  "accepted Chat conversation route",
);
assertIncludes(homeFunction, "onSubmitAccepted:J", "native completion submit callback");
assertIncludes(
  homeFunction,
  "CDRChatMode?null:`tpp`",
  "existing ChatGPT Work TPP branch",
);

const evidenceFiles = fs.readdirSync(targets.assets)
  .filter((name) => name.endsWith(".js"))
  .filter((name) =>
    /appgen-settings|debug-modal|quick-ch|quick-chat-window|remote-conversation/.test(name),
  )
  .map((name) => path.join(targets.assets, name));
const evidence = new Map([
  ["startCompletionStream", null],
  ["chatgpt-models", null],
  ["chatgpt-tpp-models", null],
  ["turn/start", null],
]);
for (const filePath of evidenceFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  for (const needle of evidence.keys()) {
    if (evidence.get(needle) == null && source.includes(needle)) evidence.set(needle, filePath);
  }
}
for (const [needle, filePath] of evidence) {
  assert.ok(filePath, `official 91948 backend/model evidence is missing: ${needle}`);
}
assert.notStrictEqual(
  evidence.get("startCompletionStream"),
  evidence.get("turn/start"),
  "Chat and Codex unexpectedly resolve through the same renderer backend bundle",
);

for (const selectorNeedle of [
  ':root[data-codex-product-mode="chat"].electron-light',
  ':root[data-codex-product-mode="chat"].electron-dark',
  "--color-background-accent:#7657d6",
  "--color-background-accent:#9d83f1",
  CSS_MARKER,
]) {
  assert.ok(!cssOnce.source.includes(selectorNeedle), `Chat-only theme must be removed: ${selectorNeedle}`);
}
assertIncludes(cssOnce.source, "--color-token-main-surface-primary", "shared Work/Codex theme tokens");
assertIncludes(cssOnce.source, ".electron-dark", "shared dark theme");

const themedCss = `${targets.css.source}\n/* ${CSS_MARKER} */\n:root[data-codex-product-mode="chat"].electron-dark{--color-background-accent:#9d83f1}\n`;
const strippedTheme = patchCss(themedCss, targets.css.path);
assert.strictEqual(strippedTheme.changed, true, "legacy Chat theme must be stripped");
assert.ok(!strippedTheme.source.includes(CSS_MARKER), "stripped CSS still has theme marker");
assert.ok(!strippedTheme.source.includes('data-codex-product-mode="chat"'), "stripped CSS still has Chat theme selectors");
verifyCss(strippedTheme.source, targets.css.path);

const noRoute = replaceOne(
  pageOnce.source,
  "path:`/chat`",
  "path:`/chat-tampered`",
  "route tamper",
);
assert.throws(
  () => verifyPage(noRoute, targets.page.path),
  /missing native Chat invariant: path:`\/chat`/,
);
const noChatSelector = replaceOne(
  pageOnce.source,
  "onSelect:()=>t(`chat`)",
  "onSelect:()=>t(`codex`)",
  "selector tamper",
);
assert.throws(
  () => verifyPage(noChatSelector, targets.page.path),
  /missing native Chat invariant: onSelect/,
);
const tppHistory = replaceOne(
  pageOnce.source,
  "Jhe({tppOnly:!CDRChatMode})",
  "Jhe({tppOnly:!0})",
  "history tamper",
);
assert.throws(
  () => verifyPage(tppHistory, targets.page.path),
  /missing native Chat invariant: Jhe/,
);
const staleAccountCache = replaceOne(
  pageOnce.source,
  "CDRChatQueryClient.removeQueries({type:`inactive`})",
  "void CDRChatQueryClient",
  "account cache tamper",
);
assert.throws(
  () => verifyPage(staleAccountCache, targets.page.path),
  /missing native Chat invariant: CDRChatQueryClient\.removeQueries/,
);
const staleActiveObserver = replaceOne(
  pageOnce.source,
  "CDRChatQueryClient.resetQueries({type:`active`})",
  "void CDRChatQueryClient",
  "active observer tamper",
);
assert.throws(
  () => verifyPage(staleActiveObserver, targets.page.path),
  /missing native Chat invariant: CDRChatQueryClient\.resetQueries/,
);
const nestedRouteEscape = replaceOne(
  pageOnce.source,
  "CDRChatRoute=e=>CDRChatMode?",
  "CDRChatRoute=e=>!1?",
  "nested project route tamper",
);
assert.throws(
  () => verifyPage(nestedRouteEscape, targets.page.path),
  /missing native Chat invariant: CDRChatRoute/,
);
const ungatedAccountHome = replaceOne(
  pageOnce.source,
  "if(i)return null;",
  "if(!1)return null;",
  "account home gate tamper",
);
assert.throws(
  () => verifyPage(ungatedAccountHome, targets.page.path),
  /missing native Chat invariant: if\(i\)return null/,
);
const tppOnlyHome = replaceOne(
  homeOnce.source,
  "conversationOrigin:CDRChatMode?null:`tpp`",
  "conversationOrigin:`tpp`",
  "model source tamper",
);
assert.throws(
  () => verifyWorkHome(tppOnlyHome, targets.home.path),
  /missing Chat home invariant: conversationOrigin/,
);
const forkedSidebar = replaceOne(
  pageOnce.source,
  "sidebarMode:CDRChatMode?`work`:`codex`,topContent:ee,chatMode:CDRChatMode",
  "sidebarMode:CDRChatMode?`chat`:`codex`,topContent:ee,chatMode:CDRChatMode",
  "sidebar chrome tamper",
);
assert.throws(
  () => verifyPage(forkedSidebar, targets.page.path),
  /still forks Chat chrome away from Work|missing native Chat invariant: sidebarMode/,
);
const noDarkTheme = `${cssOnce.source}\n/* ${CSS_MARKER} */\n:root[data-codex-product-mode="chat"].electron-dark{}\n`;
assert.throws(
  () => verifyCss(noDarkTheme, targets.css.path),
  /still contains Chat-only theme overrides/,
);

const atomicDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-native-chat-v8-"));
const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-native-chat-outside-"));
try {
  const first = path.join(atomicDir, "webview", "assets", "page.js");
  const second = path.join(atomicDir, "webview", "assets", "home.js");
  fs.mkdirSync(path.dirname(first), { recursive: true });
  fs.writeFileSync(first, "old-page");
  fs.writeFileSync(second, "old-home");

  assert.throws(() => atomicReplaceEntries([{
    path: first,
    previous: "stale-page",
    next: "new-page",
    verify: () => {},
  }], { transactionRoot: atomicDir }), /changed before staging/);
  assert.strictEqual(fs.readFileSync(first, "utf8"), "old-page");

  assert.throws(() => atomicReplaceEntries([
    { path: first, previous: "old-page", next: "first-copy", verify: () => {} },
    { path: first, previous: "old-page", next: "second-copy", verify: () => {} },
  ], { transactionRoot: atomicDir }), /duplicated/);
  assert.strictEqual(fs.readFileSync(first, "utf8"), "old-page");

  const outside = path.join(outsideDir, "outside.js");
  fs.writeFileSync(outside, "outside");
  assert.throws(() => atomicReplaceEntries([{
    path: outside,
    previous: "outside",
    next: "escaped",
    verify: () => {},
  }], { transactionRoot: atomicDir }), /escapes its root/);
  assert.strictEqual(fs.readFileSync(outside, "utf8"), "outside");

  const symlink = path.join(path.dirname(first), "page-link.js");
  fs.symlinkSync(first, symlink);
  assert.throws(() => atomicReplaceEntries([{
    path: symlink,
    previous: "old-page",
    next: "symlink-write",
    verify: () => {},
  }], { transactionRoot: atomicDir }), /regular file/);
  fs.unlinkSync(symlink);
  assertNoTransactionArtifacts(atomicDir);

  atomicReplaceEntries([
    {
      path: first,
      previous: "old-page",
      next: "new-page",
      verify: (value) => assert.strictEqual(value, "new-page"),
    },
    {
      path: second,
      previous: "old-home",
      next: "new-home",
      verify: (value) => assert.strictEqual(value, "new-home"),
    },
  ], { transactionRoot: atomicDir });
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-page");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "new-home");
  assertNoTransactionArtifacts(atomicDir);

  assert.throws(() => atomicReplaceEntries([
    {
      path: first,
      previous: "new-page",
      next: "racing-page",
      verify: (value) => {
        assert.strictEqual(value, "racing-page");
        fs.writeFileSync(second, "concurrent-home");
      },
    },
    {
      path: second,
      previous: "new-home",
      next: "racing-home",
      verify: (value) => assert.strictEqual(value, "racing-home"),
    },
  ], { transactionRoot: atomicDir }), /changed during staging/);
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-page");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "concurrent-home");
  assertNoTransactionArtifacts(atomicDir);
  fs.writeFileSync(second, "new-home");

  assert.throws(() => atomicReplaceEntries([
    {
      path: first,
      previous: "new-page",
      next: "staged-page",
      verify: (value) => assert.strictEqual(value, "staged-page"),
    },
    {
      path: second,
      previous: "new-home",
      next: "staged-home",
      verify: () => { throw new Error("staged rejection"); },
    },
  ], { transactionRoot: atomicDir }), /staged rejection/);
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-page");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "new-home");
  assertNoTransactionArtifacts(atomicDir);

  let firstVerifyCount = 0;
  let secondVerifyCount = 0;
  assert.throws(() => atomicReplaceEntries([
    {
      path: first,
      previous: "new-page",
      next: "committed-page",
      verify: (value) => {
        firstVerifyCount += 1;
        assert.strictEqual(value, "committed-page");
      },
    },
    {
      path: second,
      previous: "new-home",
      next: "committed-home",
      verify: (value) => {
        secondVerifyCount += 1;
        assert.strictEqual(value, "committed-home");
        if (secondVerifyCount === 2) throw new Error("commit verification rejection");
      },
    },
  ], { transactionRoot: atomicDir }), /commit verification rejection/);
  assert.strictEqual(firstVerifyCount, 2, "first entry was not verified after commit");
  assert.strictEqual(secondVerifyCount, 2, "second entry did not reach commit verification");
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-page");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "new-home");
  assertNoTransactionArtifacts(atomicDir);

  const firstBackup = `${first}.simulated.backup`;
  const secondBackup = `${second}.simulated.backup`;
  const journalPath = path.join(atomicDir, ".native-chat-transaction.json");
  fs.writeFileSync(firstBackup, "new-page");
  fs.writeFileSync(secondBackup, "new-home");
  fs.writeFileSync(first, "partially-installed-page");
  fs.writeFileSync(second, "partially-installed-home");
  fs.writeFileSync(journalPath, JSON.stringify({
    version: 1,
    entries: [
      { path: first, backup: firstBackup },
      { path: second, backup: secondBackup },
    ],
  }));
  assert.strictEqual(recoverAtomicTransaction(atomicDir), true);
  assert.strictEqual(fs.readFileSync(first, "utf8"), "new-page");
  assert.strictEqual(fs.readFileSync(second, "utf8"), "new-home");
  assert.strictEqual(recoverAtomicTransaction(atomicDir), false);
  assertNoTransactionArtifacts(atomicDir);
} finally {
  fs.rmSync(atomicDir, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
}

assert.strictEqual(
  fs.readFileSync(targets.page.path, "utf8"),
  targets.page.source,
  "test mutated the generated page bundle",
);
assert.strictEqual(
  fs.readFileSync(targets.home.path, "utf8"),
  targets.home.source,
  "test mutated the generated Work home bundle",
);
assert.strictEqual(
  fs.readFileSync(targets.css.path, "utf8"),
  targets.css.source,
  "test mutated the generated CSS bundle",
);

console.log("[ok] native Chat v9 Work-chrome parity, history, backend, theme-strip, transaction, and tamper tests passed");

