#!/usr/bin/env node
/**
 * Promote the native ChatGPT client already shipped in the official Intel app
 * into a third Codex / ChatGPT Work / Chat product mode.
 *
 * Chat and ChatGPT Work share the same Work chrome (sidebar, history layout,
 * projects, home). The only intentional differences are:
 *   - Chat uses non-TPP ChatGPT models / ChatGPT usage
 *   - Work uses TPP / Codex usage
 *
 * Supported upstream: macOS Intel 26.707.91948 (build 5440).
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { relPath, SRC_DIR } = require("./patch-util");

const SUPPORTED_PLATFORM = "mac-x64";
const PAGE_MARKER = "codex-rebuild:native-chat-mode-v9";
const PAGE_MARKER_V8 = "codex-rebuild:native-chat-mode-v8";
const HOME_MARKER = "codex-rebuild:native-chat-home-v8";
const CSS_MARKER = "codex-rebuild:native-chat-theme-v8";
const CHAT_HOME_ROUTE = "/chat?mode=chat";

// Chat history includes non-TPP projects that can omit gizmo.display.
const UNSAFE_OL_PROJECT_DISPLAY =
  "color:n.project.gizmo.display.theme,fallbackIcon:(0,jL.jsx)(TD,{className:`icon-xs`}),icon:n.project.gizmo.display.emoji}),label:n.project.gizmo.display.name.trim()||n.project.gizmo.id";
const SAFE_OL_PROJECT_DISPLAY =
  "color:n.project.gizmo.display?.theme,fallbackIcon:(0,jL.jsx)(TD,{className:`icon-xs`}),icon:n.project.gizmo.display?.emoji}),label:(n.project.gizmo.display?.name??``).trim()||n.project.gizmo.id";
const UNSAFE_FKE_PROJECT_DISPLAY =
  "t[67]!==u.gizmo.display.emoji||t[68]!==u.gizmo.display.theme||t[69]!==Ce?(we=(0,sL.jsx)(rI,{className:`icon-xs`,color:u.gizmo.display.theme,fallbackIcon:Ce,icon:u.gizmo.display.emoji}),t[67]=u.gizmo.display.emoji,t[68]=u.gizmo.display.theme,t[69]=Ce,t[70]=we)";
const SAFE_FKE_PROJECT_DISPLAY =
  "t[67]!==u.gizmo.display?.emoji||t[68]!==u.gizmo.display?.theme||t[69]!==Ce?(we=(0,sL.jsx)(rI,{className:`icon-xs`,color:u.gizmo.display?.theme,fallbackIcon:Ce,icon:u.gizmo.display?.emoji}),t[67]=u.gizmo.display?.emoji,t[68]=u.gizmo.display?.theme,t[69]=Ce,t[70]=we)";
const UNSAFE_CHAT_HOME_GATE =
  "let a=xy().status,o=Q(VS);if(i)return null;if((o??a)!==`allowed`)return(0,g0.jsx)(I1,{});";
const SAFE_CHAT_HOME_GATE =
  "let a=xy().status,o=Q(VS)??a;if(i)return null;if(o===`loading`)return null;if(o!==`allowed`)return(0,g0.jsx)(I1,{});";
const UNSAFE_PROJECT_TITLE =
  "function Jke(e){return e.gizmo.display.name.trim()||e.gizmo.id}";
const SAFE_PROJECT_TITLE =
  "function Jke(e){return (e.gizmo.display?.name??``).trim()||e.gizmo.id}";

function countOccurrences(source, needle) {
  if (needle.length === 0) throw new Error("Cannot count an empty anchor");
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function replaceExactly(source, needle, replacement, label, expected = 1) {
  const count = countOccurrences(source, needle);
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} anchor(s), found ${count}`);
  }
  return source.split(needle).join(replacement);
}

function parseBundle(source, bundlePath) {
  try {
    return parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    const position = Number.isInteger(error.pos) ? error.pos : 0;
    const context = source.slice(Math.max(0, position - 160), position + 160);
    throw new Error(
      `${relPath(bundlePath)} failed to parse: ${error.message}\nContext: ${context}`,
    );
  }
}

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) walk(item, visitor);
      }
    } else if (child && typeof child === "object" && child.type) {
      walk(child, visitor);
    }
  }
}

function findFunction(ast, name, bundlePath) {
  const matches = [];
  walk(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === name) matches.push(node);
  });
  if (matches.length !== 1) {
    throw new Error(`${relPath(bundlePath)} expected one function ${name}, found ${matches.length}`);
  }
  return matches[0];
}

function replaceFunction(source, name, replacement, bundlePath) {
  const ast = parseBundle(source, bundlePath);
  const node = findFunction(ast, name, bundlePath);
  return source.slice(0, node.start) + replacement + source.slice(node.end);
}

function transformFunction(source, name, transform, bundlePath) {
  const ast = parseBundle(source, bundlePath);
  const node = findFunction(ast, name, bundlePath);
  const previous = source.slice(node.start, node.end);
  const next = transform(previous);
  if (next === previous) throw new Error(`${relPath(bundlePath)} ${name} transform changed no bytes`);
  return source.slice(0, node.start) + next + source.slice(node.end);
}

function writeDurable(filePath, content, flags, mode) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, flags, mode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function transactionPath(root) {
  return path.join(root, ".native-chat-transaction.json");
}

function recoverAtomicTransaction(root) {
  const journalPath = transactionPath(root);
  if (!fs.existsSync(journalPath)) return false;
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (journal?.version !== 1 || !Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error(`Invalid native Chat transaction journal: ${journalPath}`);
  }
  for (const entry of journal.entries) {
    if (
      typeof entry.path !== "string" ||
      typeof entry.backup !== "string" ||
      !path.resolve(entry.path).startsWith(rootPrefix) ||
      !path.resolve(entry.backup).startsWith(rootPrefix) ||
      !fs.existsSync(entry.backup)
    ) {
      throw new Error(`Unrecoverable native Chat transaction entry: ${journalPath}`);
    }
  }
  for (const entry of journal.entries) {
    const temporary = `${entry.path}.native-chat-recovery-${process.pid}`;
    writeDurable(temporary, fs.readFileSync(entry.backup, "utf8"), "wx", fs.statSync(entry.backup).mode);
    fs.renameSync(temporary, entry.path);
    fsyncDirectory(path.dirname(entry.path));
  }
  fs.unlinkSync(journalPath);
  fsyncDirectory(root);
  for (const entry of journal.entries) {
    fs.unlinkSync(entry.backup);
    fsyncDirectory(path.dirname(entry.backup));
  }
  return true;
}

function atomicReplaceEntries(entries, { transactionRoot } = {}) {
  if (entries.length === 0) return;
  if (transactionRoot == null) throw new Error("atomicReplaceEntries requires transactionRoot");
  recoverAtomicTransaction(transactionRoot);
  const rootResolved = path.resolve(transactionRoot);
  const rootReal = fs.realpathSync(rootResolved);
  const lexicalPrefix = `${rootResolved}${path.sep}`;
  const realPrefix = `${rootReal}${path.sep}`;
  const seenTargets = new Set();
  const prepared = entries.map((entry, index) => {
    if (
      entry == null ||
      typeof entry.path !== "string" ||
      typeof entry.previous !== "string" ||
      typeof entry.next !== "string" ||
      typeof entry.verify !== "function"
    ) {
      throw new Error(`Invalid native Chat transaction entry at index ${index}`);
    }
    const target = path.resolve(entry.path);
    if (!target.startsWith(lexicalPrefix)) {
      throw new Error(`Native Chat transaction target escapes its root: ${entry.path}`);
    }
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Native Chat transaction target must be a regular file: ${entry.path}`);
    }
    const targetReal = fs.realpathSync(target);
    if (!targetReal.startsWith(realPrefix) || seenTargets.has(targetReal)) {
      throw new Error(`Native Chat transaction target is outside its root or duplicated: ${entry.path}`);
    }
    seenTargets.add(targetReal);
    if (fs.readFileSync(target, "utf8") !== entry.previous) {
      throw new Error(`Native Chat transaction target changed before staging: ${entry.path}`);
    }
    return { ...entry, path: target };
  });
  const nonce = `${process.pid}-${Date.now()}`;
  const staged = [];
  const journalPath = transactionPath(transactionRoot);
  try {
    for (let index = 0; index < prepared.length; index += 1) {
      const entry = prepared[index];
      const temporary = `${entry.path}.native-chat-${nonce}-${index}.tmp`;
      const backup = `${entry.path}.native-chat-${nonce}-${index}.backup`;
      const mode = fs.statSync(entry.path).mode;
      const stagedEntry = { ...entry, temporary, backup };
      staged.push(stagedEntry);
      writeDurable(temporary, entry.next, "wx", mode);
      entry.verify(fs.readFileSync(temporary, "utf8"), entry.path);
      writeDurable(backup, entry.previous, "wx", mode);
      fsyncDirectory(path.dirname(backup));
    }
    for (const entry of prepared) {
      if (fs.readFileSync(entry.path, "utf8") !== entry.previous) {
        throw new Error(`Native Chat transaction target changed during staging: ${entry.path}`);
      }
    }
    const journalTemp = `${journalPath}.${nonce}.tmp`;
    writeDurable(journalTemp, JSON.stringify({
      version: 1,
      entries: staged.map(({ path: filePath, backup }) => ({ path: filePath, backup })),
    }), "wx", 0o600);
    fs.renameSync(journalTemp, journalPath);
    fsyncDirectory(transactionRoot);
    for (const entry of staged) {
      fs.renameSync(entry.temporary, entry.path);
      fsyncDirectory(path.dirname(entry.path));
    }
    for (const entry of staged) entry.verify(fs.readFileSync(entry.path, "utf8"), entry.path);
    fs.unlinkSync(journalPath);
    fsyncDirectory(transactionRoot);
    for (const entry of staged) {
      fs.unlinkSync(entry.backup);
      fsyncDirectory(path.dirname(entry.backup));
    }
  } catch (error) {
    if (fs.existsSync(journalPath)) {
      try { recoverAtomicTransaction(transactionRoot); }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Native Chat patch and rollback both failed");
      }
    }
    throw error;
  } finally {
    for (const entry of staged) {
      try { fs.unlinkSync(entry.temporary); } catch {}
      if (!fs.existsSync(journalPath)) {
        try { fs.unlinkSync(entry.backup); } catch {}
      }
    }
  }
}

const SELECTOR_SOURCE = String.raw`function ROe({mode:e,onModeSelect:t}){let n=Xf(),r=e===\`chat\`?\`Chat\`:e===\`codex\`?n.formatMessage(eI.codex):n.formatMessage({id:\`sidebarElectron.productMode.chatGptWork.plainText\`,defaultMessage:\`ChatGPT Work\`,description:\`Plain-text ChatGPT Work mode name for the accessible sidebar mode selector label\`}),i=e===\`chat\`?(0,$F.jsx)(\`span\`,{className:\`truncate font-openai-sans font-semibold\`,children:(0,$F.jsx)(c,{id:\`sidebarElectron.productMode.chat\`,defaultMessage:\`Chat\`,description:\`Chat option in the product mode selector\`})}):e===\`work\`?(0,$F.jsx)(c,{...eI.chatGptWork,values:{chatGpt:HOe,work:VOe}}):(0,$F.jsx)(\`span\`,{className:\`truncate font-openai-sans font-semibold\`,children:(0,$F.jsx)(c,{...eI.codex})}),a=(0,$F.jsxs)(hl,{allowShrink:!0,"aria-label":n.formatMessage({id:\`sidebarElectron.productMode.trigger\`,defaultMessage:\`Switch mode, current mode: {mode}\`,description:\`Accessible label for the Codex, Work, and Chat mode selector\`},{mode:r}),className:\`group -ml-2 h-8 min-w-0 rounded-xl px-2 !text-[17px] !leading-6 font-medium\`,color:\`ghostActive\`,children:[i,(0,$F.jsx)(sy,{className:\`icon-2xs shrink-0 text-token-input-placeholder-foreground opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100\`})]}),o=(0,$F.jsx)(T_.Item,{className:\`py-2.5 text-base\`,RightIcon:e===\`work\`?Vd:void 0,SubText:(0,$F.jsx)(\`span\`,{className:\`text-token-description-foreground\`,children:(0,$F.jsx)(c,{id:\`sidebarElectron.productMode.work.description.recommended\`,defaultMessage:\`Create, learn, and explore\`,description:\`Description beneath the ChatGPT Work option\`})}),onSelect:()=>t(\`work\`),children:(0,$F.jsx)(c,{...eI.chatGptWork,values:{chatGpt:BOe,work:zOe}})}),s=(0,$F.jsx)(T_.Item,{className:\`py-2.5 text-base\`,RightIcon:e===\`codex\`?Vd:void 0,SubText:(0,$F.jsx)(\`span\`,{className:\`text-sm text-token-description-foreground\`,children:(0,$F.jsx)(c,{id:\`sidebarElectron.productMode.codex.description.developer\`,defaultMessage:\`Build, debug, and ship\`,description:\`Description beneath the Codex option\`})}),onSelect:()=>t(\`codex\`),children:(0,$F.jsx)(\`span\`,{className:\`font-openai-sans\`,children:(0,$F.jsx)(c,{...eI.codex})})}),l=(0,$F.jsx)(T_.Item,{className:\`py-2.5 text-base\`,RightIcon:e===\`chat\`?Vd:void 0,SubText:(0,$F.jsx)(\`span\`,{className:\`text-sm text-token-description-foreground\`,children:(0,$F.jsx)(c,{id:\`sidebarElectron.productMode.chat.description\`,defaultMessage:\`Your synced ChatGPT conversations and projects\`,description:\`Description beneath the Chat option\`})}),onSelect:()=>t(\`chat\`),children:(0,$F.jsx)(\`span\`,{className:\`font-openai-sans\`,children:(0,$F.jsx)(c,{id:\`sidebarElectron.productMode.chat\`,defaultMessage:\`Chat\`,description:\`Chat option in the product mode selector\`})})});return(0,$F.jsxs)(iv,{align:\`start\`,contentClassName:\`p-1.5\`,contentWidth:\`menuWide\`,sideOffset:4,triggerButton:a,children:[o,s,l]})}`.replaceAll("\\`", "`");

const NEW_CHAT_SOURCE = String.raw`function NOe({showSearchNavItem:e,chatMode:t}){let n=Cn(),r=t?(0,XF.jsx)(Dw,{icon:OC,onClick:()=>{n(\`${CHAT_HOME_ROUTE}\`)},label:(0,XF.jsx)(c,{id:\`sidebarElectron.newChat\`,defaultMessage:\`New chat\`,description:\`Starts a new ChatGPT chat from the sidebar\`}),className:\`group\`}):(0,XF.jsx)(POe,{}),i=e?(0,XF.jsx)(yOe,{}):null;return(0,XF.jsxs)(PC,{children:[r,i]})}`.replaceAll("\\`", "`");

const PROJECT_CHAT_ROW_SOURCE = 'function Uke(e){let{activeConversationId:n,activeServerConversationId:r,item:i,chatMode:CDRChatMode=!1}=e,CDRChatRoute=e=>CDRChatMode?`${e}${e.includes(`?`)?`&`:`?`}mode=chat`:e;switch(i.kind){case`optimistic`:{let e=i.conversationId,r=CDRChatRoute(dt(i.conversationId));return(0,sL.jsx)(tL,{activeConversationId:n,conversationId:e,isGrouped:!0,route:r})}case`server`:{let e=i.conversation,a=i.conversation.is_starred===!0,o=CDRChatRoute(dt(i.conversation.id));return(0,sL.jsx)(nL,{activeConversationId:n,activeServerConversationId:r,conversation:e,isGrouped:!0,isPinned:a,route:o})}}}';

const CHAT_HOME_WRAPPER = String.raw`/* ${PAGE_MARKER} */function CDRChatHome(){let{accountId:e}=u_(),t=Yc(),[n,r]=(0,h0.useState)(e),i=n!==e;(0,h0.useLayoutEffect)(()=>{i&&(t.removeQueries({type:\`inactive\`}),void t.resetQueries({type:\`active\`}),r(e))},[e,i,t]);${SAFE_CHAT_HOME_GATE}return(0,g0.jsx)(h0.Suspense,{fallback:null,children:(0,g0.jsx)(T0,{chatMode:!0},"chat:"+(n??"anonymous"))})}`.replaceAll("\\`", "`");

const CHAT_ROUTE_STATE_V8 =
  "a=md(X),CDRChatQueryClient=Yc(),CDRChatLocation=ce(),CDRChatNavigate=Cn(),CDRChatMode=CDRChatLocation.pathname===`/chat`||new URLSearchParams(CDRChatLocation.search).get(`mode`)===`chat`;(0,rz.useEffect)(()=>{let e=document.documentElement;return CDRChatMode?e.setAttribute(`data-codex-product-mode`,`chat`):e.removeAttribute(`data-codex-product-mode`),()=>{e.removeAttribute(`data-codex-product-mode`)}},[CDRChatMode]);let{accountId:o}=u_(),[CDRChatSettledAccount,CDRChatSetSettledAccount]=(0,rz.useState)(o),CDRChatAccountChanging=CDRChatSettledAccount!==o;(0,rz.useLayoutEffect)(()=>{CDRChatAccountChanging&&(CDRChatQueryClient.removeQueries({type:`inactive`}),void CDRChatQueryClient.resetQueries({type:`active`}),CDRChatSetSettledAccount(o))},[o,CDRChatAccountChanging,CDRChatQueryClient]);let ";
const CHAT_ROUTE_STATE_V9 =
  "a=md(X),CDRChatQueryClient=Yc(),CDRChatLocation=ce(),CDRChatNavigate=Cn(),CDRChatMode=CDRChatLocation.pathname===`/chat`||new URLSearchParams(CDRChatLocation.search).get(`mode`)===`chat`;let{accountId:o}=u_(),[CDRChatSettledAccount,CDRChatSetSettledAccount]=(0,rz.useState)(o),CDRChatAccountChanging=CDRChatSettledAccount!==o;(0,rz.useLayoutEffect)(()=>{CDRChatAccountChanging&&(CDRChatQueryClient.removeQueries({type:`inactive`}),void CDRChatQueryClient.resetQueries({type:`active`}),CDRChatSetSettledAccount(o))},[o,CDRChatAccountChanging,CDRChatQueryClient]);let ";

function stripChatTheme(source) {
  const marker = `\n/* ${CSS_MARKER} */`;
  const start = source.indexOf(marker);
  if (start === -1) return { source, changed: false };
  // Theme block runs to EOF in our patch.
  return { source: source.slice(0, start), changed: true };
}

function alignChatUiWithWork(source, bundlePath) {
  let next = source;
  let changed = false;

  if (next.includes(PAGE_MARKER_V8)) {
    next = replaceExactly(next, PAGE_MARKER_V8, PAGE_MARKER, "Chat page marker v9");
    changed = true;
  }

  if (next.includes(CHAT_ROUTE_STATE_V8)) {
    next = replaceExactly(next, CHAT_ROUTE_STATE_V8, CHAT_ROUTE_STATE_V9, "remove Chat-only theme attribute");
    changed = true;
  }

  // Chat must reuse Work chrome, not a separate `chat` sidebar mode.
  const chatSidebar = "sidebarMode:CDRChatMode?`chat`:`codex`";
  const workSidebar = "sidebarMode:CDRChatMode?`work`:`codex`";
  if (next.includes(chatSidebar)) {
    next = replaceExactly(
      next,
      chatSidebar,
      workSidebar,
      "Work sidebar chrome for Chat",
      countOccurrences(next, chatSidebar),
    );
    changed = true;
  }

  if (next.includes("F=CDRChatMode?`chat`:l===`STEPS_PROSE`?`work`:`codex`")) {
    next = replaceExactly(
      next,
      "F=CDRChatMode?`chat`:l===`STEPS_PROSE`?`work`:`codex`",
      "F=CDRChatMode||l===`STEPS_PROSE`?`work`:`codex`",
      "Work scroll namespace for Chat",
    );
    changed = true;
  }

  // Undo Chat-only nav hiding so Chat matches Work.
  const navReverts = [
    ["r!==`chat`&&b?(0,XF.jsx)", "b?(0,XF.jsx)", "restore Library in Chat"],
    ["r!==`chat`&&_&&v!==`project`?(0,XF.jsx)(FOe", "_&&v!==`project`?(0,XF.jsx)(FOe", "restore Projects nav in Chat"],
    ["t&&r!==`chat`&&(r===`codex`||l)?", "t&&(r===`codex`||l)?", "restore Skills in Chat"],
    ["r!==`chat`&&x?(0,XF.jsx)(yf", "x?(0,XF.jsx)(yf", "restore Pull Requests in Chat"],
    ["r===`chat`||_?null:(0,XF.jsx)(hOe", "_?null:(0,XF.jsx)(hOe", "restore fallback Projects in Chat"],
    ["r===`chat`?null:(0,XF.jsx)(fOe,{})", "(0,XF.jsx)(fOe,{})", "restore external tool nav in Chat"],
  ];
  for (const [from, to, label] of navReverts) {
    if (next.includes(from)) {
      next = replaceExactly(next, from, to, label);
      changed = true;
    }
  }

  if (next.includes("heading:CDRChatMode?`Chats`:`Tasks`")) {
    next = replaceExactly(next, "heading:CDRChatMode?`Chats`:`Tasks`", "heading:`Tasks`", "Work history heading for Chat");
    changed = true;
  }
  if (next.includes("te;if(CDRChatMode)te=G;else switch(u){")) {
    next = replaceExactly(next, "te;if(CDRChatMode)te=G;else switch(u){", "te;switch(u){", "Work history sections for Chat");
    changed = true;
  }

  if (next.includes("data-codex-product-mode") || next.includes("sidebarMode:CDRChatMode?`chat`")) {
    throw new Error(`${relPath(bundlePath)} still applies Chat-only chrome instead of Work UI`);
  }
  if (next.includes("heading:CDRChatMode?`Chats`") || next.includes("if(CDRChatMode)te=G")) {
    throw new Error(`${relPath(bundlePath)} still forks Chat history layout away from Work`);
  }

  return { source: next, changed };
}

function hardenNativeChatPage(source, bundlePath) {
  let next = source;
  let changed = false;
  if (next.includes(UNSAFE_OL_PROJECT_DISPLAY)) {
    next = replaceExactly(next, UNSAFE_OL_PROJECT_DISPLAY, SAFE_OL_PROJECT_DISPLAY, "safe ChatGPT project drag display");
    changed = true;
  }
  if (next.includes(UNSAFE_FKE_PROJECT_DISPLAY)) {
    next = replaceExactly(next, UNSAFE_FKE_PROJECT_DISPLAY, SAFE_FKE_PROJECT_DISPLAY, "safe ChatGPT project row display");
    changed = true;
  }
  if (next.includes(UNSAFE_CHAT_HOME_GATE)) {
    next = replaceExactly(next, UNSAFE_CHAT_HOME_GATE, SAFE_CHAT_HOME_GATE, "Chat home loading gate");
    changed = true;
  }
  if (next.includes(UNSAFE_PROJECT_TITLE)) {
    next = replaceExactly(next, UNSAFE_PROJECT_TITLE, SAFE_PROJECT_TITLE, "safe ChatGPT project title");
    changed = true;
  }
  if (next.includes("n.project.gizmo.display.theme") || next.includes("u.gizmo.display.theme")) {
    throw new Error(`${relPath(bundlePath)} still reads ChatGPT project display.theme unsafely`);
  }
  if (next.includes("e.gizmo.display.name.trim()")) {
    throw new Error(`${relPath(bundlePath)} still reads ChatGPT project display.name unsafely`);
  }
  if (next.includes(UNSAFE_CHAT_HOME_GATE)) {
    throw new Error(`${relPath(bundlePath)} Chat home still treats loading as an error`);
  }
  return { source: next, changed };
}

function patchPage(source, bundlePath) {
  if (source.includes(PAGE_MARKER) || source.includes(PAGE_MARKER_V8)) {
    let next = source;
    let changed = false;
    if (source.includes(PAGE_MARKER_V8) || source.includes("sidebarMode:CDRChatMode?`chat`") || source.includes("data-codex-product-mode")) {
      const aligned = alignChatUiWithWork(next, bundlePath);
      next = aligned.source;
      changed = changed || aligned.changed;
    }
    const hardened = hardenNativeChatPage(next, bundlePath);
    next = hardened.source;
    changed = changed || hardened.changed;
    verifyPage(next, bundlePath);
    return { source: next, changed };
  }
  for (const legacy of [
    "codex-rebuild:dedicated-chat-mode-v7",
    "persist:codex-chatgpt-live",
    "CodexDedicatedChatSurface",
  ]) {
    if (source.includes(legacy)) {
      throw new Error(`${relPath(bundlePath)} contains legacy webview Chat code; resync upstream first`);
    }
  }
  for (const name of ["ROe", "NOe", "MOe", "mje", "IAe", "eAe", "OL", "Fke", "Uke", "JUe"]) {
    findFunction(parseBundle(source, bundlePath), name, bundlePath);
  }
  let code = replaceFunction(source, "ROe", SELECTOR_SOURCE, bundlePath);
  code = replaceFunction(code, "NOe", NEW_CHAT_SOURCE, bundlePath);
  code = replaceFunction(code, "Uke", PROJECT_CHAT_ROW_SOURCE, bundlePath);

  // Keep Work nav chrome identical in Chat — only remove the standalone Quick Chat row.
  code = transformFunction(code, "MOe", (body) => {
    return replaceExactly(body, "r===`codex`&&n?(0,XF.jsx)(cOe,{}):null", "null", "standalone Quick Chat row removal");
  }, bundlePath);

  code = transformFunction(code, "mje", (body) => {
    let next = replaceExactly(
      body,
      "a=md(X),{accountId:o}=u_(),",
      CHAT_ROUTE_STATE_V9,
      "Chat route state",
    );
    next = replaceExactly(next, "I=j==null&&F===`non_coding`||A===`STEPS_PROSE`?`work`:`codex`", "I=CDRChatMode?`chat`:(j==null&&F===`non_coding`||A===`STEPS_PROSE`?`work`:`codex`)", "Chat selected mode");
    next = replaceExactly(
      next,
      "let B=z,V;t[16]!==i||t[17]!==r?(V=(0,iz.jsx)(MOe,{chatGptProjectCrudStatus:void 0,desktopNavItemsEnabled:i,quickChatEnabled:r,sidebarMode:`codex`}),t[16]=i,t[17]=r,t[18]=V):V=t[18];",
      "let B=z,V=(0,iz.jsx)(MOe,{chatGptProjectCrudStatus:void 0,desktopNavItemsEnabled:i,quickChatEnabled:r,sidebarMode:CDRChatMode?`work`:`codex`});",
      "Work nav chrome for Chat",
    );
    next = replaceExactly(
      next,
      "let ae;t[30]!==u||t[31]!==I||t[32]!==a?(ae=u?(0,iz.jsxs)(`div`,{className:`ml-2 flex items-center`,children:[(0,iz.jsx)(ROe,{mode:I,onModeSelect:e=>{Iee(a,e===`work`?vf:Tr)}}),(0,iz.jsx)(vOe,{})]}):null,t[30]=u,t[31]=I,t[32]=a,t[33]=ae):ae=t[33];",
      "let ae=u?(0,iz.jsxs)(`div`,{className:`ml-2 flex items-center`,children:[(0,iz.jsx)(ROe,{mode:I,onModeSelect:e=>{if(e===`chat`){CDRChatNavigate(`/chat?mode=chat`);return}Iee(a,e===`work`?vf:Tr),CDRChatMode&&CDRChatNavigate(`/`)}}),(0,iz.jsx)(vOe,{})]}):null;",
      "Chat mode selection",
    );
    next = replaceExactly(next, "K=(0,iz.jsx)(NOe,{showSearchNavItem:oe})", "K=(0,iz.jsx)(NOe,{showSearchNavItem:oe,chatMode:CDRChatMode})", "Chat new button");
    next = replaceExactly(
      next,
      "let ce;t[40]!==k||t[41]!==ee?(ce=(0,iz.jsx)(IAe,{onScrolledContentUnderHeaderChange:k,scrollContainerRef:g,sidebarMode:`codex`,topContent:ee}),t[40]=k,t[41]=ee,t[42]=ce):ce=t[42];",
      "let CDRChatSidebarNode=CDRChatMode&&CDRChatAccountChanging?null:(0,iz.jsx)(IAe,{onScrolledContentUnderHeaderChange:k,scrollContainerRef:g,sidebarMode:CDRChatMode?`work`:`codex`,topContent:ee,chatMode:CDRChatMode},CDRChatMode?`chat:${CDRChatSettledAccount??`anonymous`}`:`codex`);",
      "Chat history sidebar",
    );
    next = replaceExactly(
      next,
      "let le;t[43]!==ne||t[44]!==se||t[45]!==ce?(le=(0,iz.jsxs)(`nav`,{className:`sidebar-foreground-muted flex min-h-0 flex-1 flex-col`,role:`navigation`,\"aria-label\":ne,children:[se,ce]}),t[43]=ne,t[44]=se,t[45]=ce,t[46]=le):le=t[46];",
      "let le=(0,iz.jsxs)(`nav`,{className:`sidebar-foreground-muted flex min-h-0 flex-1 flex-col`,role:`navigation`,\"aria-label\":ne,children:[se,CDRChatSidebarNode]});",
      "Chat account-keyed navigation",
    );
    return next;
  }, bundlePath);

  code = transformFunction(code, "IAe", (body) => {
    let next = replaceExactly(body, "function IAe({onScrolledContentUnderHeaderChange:e,scrollContainerRef:t,sidebarMode:n,topContent:r})", "function IAe({onScrolledContentUnderHeaderChange:e,scrollContainerRef:t,sidebarMode:n,topContent:r,chatMode:CDRChatMode=!1})", "Chat IAe prop");
    next = replaceExactly(next, "F=l===`STEPS_PROSE`?`work`:`codex`", "F=CDRChatMode||l===`STEPS_PROSE`?`work`:`codex`", "Work scroll namespace for Chat");
    next = replaceExactly(next, ",!f&&(h?T.isWorkspaceRootOptionsLoading:v))", ",!CDRChatMode&&!f&&(h?T.isWorkspaceRootOptionsLoading:v))", "Chat history loading gate");
    next = replaceExactly(next, ",R;if(m)R=[(0,yR.jsx)(eAe,{},`unified`)];", ",R;if(CDRChatMode)R=[(0,yR.jsx)(eAe,{chatMode:!0},`chat`)];else if(m)R=[(0,yR.jsx)(eAe,{},`unified`)];", "Chat unified history branch");
    return next;
  }, bundlePath);

  code = transformFunction(code, "eAe", (body) => {
    let next = replaceExactly(body, "function eAe(){", "function eAe({chatMode:CDRChatMode=!1}={}){", "Chat history prop");
    next = replaceExactly(
      next,
      "T=(0,AL.useContext)(oC),E=Jhe({tppOnly:!0}),D=",
      "T=(0,AL.useContext)(oC),CDRChatSource=Jhe({tppOnly:!CDRChatMode}),E=CDRChatMode?{...CDRChatSource,chatTargets:CDRChatSource.chatTargets.map(e=>({...e,route:`${e.route}?mode=chat`})),pinnedTargets:CDRChatSource.pinnedTargets.map(e=>({...e,route:`${e.route}?mode=chat`}))}:CDRChatSource,D=",
      "non-TPP Chat history source",
    );
    next = replaceExactly(
      next,
      "...E.pinnedProjects.map(e=>({key:xE(e.gizmo.id),kind:`project`,pinned:!0,source:`chatgpt`})),...E.chatTargets.map",
      "...E.pinnedProjects.map(e=>({key:xE(e.gizmo.id),kind:`project`,pinned:!0,source:`chatgpt`})),...E.visibleProjects.map(e=>({key:xE(e.gizmo.id),kind:`project`,pinned:!1,source:`chatgpt`})),...E.chatTargets.map",
      "Chat project ordering",
    );
    next = replaceExactly(
      next,
      "...E.pinnedProjects.map(e=>[xE(e.gizmo.id),{source:`chatgpt`,isPinned:!0,project:e}])]),P=",
      "...E.pinnedProjects.map(e=>[xE(e.gizmo.id),{source:`chatgpt`,isPinned:!0,project:e}]),...E.visibleProjects.map(e=>[xE(e.gizmo.id),{source:`chatgpt`,isPinned:!1,project:e}])]),P=",
      "Chat project map",
    );
    next = replaceExactly(
      next,
      "source:`all`}),M=new Map",
      "source:`all`});if(CDRChatMode){let e=e=>e.startsWith(`chatgpt:`);j={...j,chatKeys:[...E.visibleProjects.map(e=>xE(e.gizmo.id)),...j.chatKeys].filter(e),pinnedKeys:j.pinnedKeys.filter(e)}}let M=new Map",
      "Chat-only history keys",
    );
    // Keep Work's "Tasks" heading and section switch — identical chrome.
    next = replaceExactly(next, "allowCodexThreadProjectDrag:!0", "allowCodexThreadProjectDrag:!CDRChatMode", "Chat drag isolation");
    next = replaceExactly(next, "chatGptSource:E,codexProjectKindByThreadKey:k", "chatGptSource:E,chatMode:CDRChatMode,codexProjectKindByThreadKey:k", "Chat project row mode", 2);
    return next;
  }, bundlePath);

  code = transformFunction(code, "OL", (body) => {
    let next = replaceExactly(body, "chatGptSource:r,codexProjectKindByThreadKey:i", "chatGptSource:r,chatMode:CDRChatMode=!1,codexProjectKindByThreadKey:i", "Chat OL prop");
    next = replaceExactly(next, "let R;t[35]!==r||t[36]!==a||t[37]!==c||t[38]!==u||t[39]!==d||t[40]!==_||t[41]!==y?(R=", "let R=", "Chat project renderer cache start");
    next = replaceExactly(next, "},t[35]=r,t[36]=a,t[37]=c,t[38]=u,t[39]=d,t[40]=_,t[41]=y,t[42]=R):R=t[42];", "};", "Chat project renderer cache end");
    next = replaceExactly(next, "activeServerConversationId:r.activeServerConversationId,expandable:!0", "activeServerConversationId:r.activeServerConversationId,chatMode:CDRChatMode,expandable:!0", "Chat expandable project mode");
    next = replaceExactly(next, UNSAFE_OL_PROJECT_DISPLAY, SAFE_OL_PROJECT_DISPLAY, "safe ChatGPT project drag display");
    return next;
  }, bundlePath);

  code = transformFunction(code, "Fke", (body) => {
    let next = replaceExactly(body, "activeServerConversationId:i,expandable:a", "activeServerConversationId:i,chatMode:CDRChatMode=!1,expandable:a", "Chat Fke prop");
    next = replaceExactly(
      next,
      "let s;t[52]!==n||t[53]!==i?(s=e=>(0,sL.jsx)(Uke,{activeConversationId:n,activeServerConversationId:i,item:e}),t[52]=n,t[53]=i,t[54]=s):s=t[54];",
      "let s=e=>(0,sL.jsx)(Uke,{activeConversationId:n,activeServerConversationId:i,item:e,chatMode:CDRChatMode});",
      "nested Chat project conversation route",
    );
    next = replaceExactly(next, UNSAFE_FKE_PROJECT_DISPLAY, SAFE_FKE_PROJECT_DISPLAY, "safe ChatGPT project row display");
    return next;
  }, bundlePath);

  const ju = findFunction(parseBundle(code, bundlePath), "JUe", bundlePath);
  code = code.slice(0, ju.end) + CHAT_HOME_WRAPPER + code.slice(ju.end);
  code = replaceExactly(
    code,
    "(0,g0.jsx)(Lt,{path:`/`,element:(0,g0.jsx)(JUe,{})}),",
    "(0,g0.jsx)(Lt,{path:`/`,element:(0,g0.jsx)(JUe,{})}),(0,g0.jsx)(Lt,{path:`/chat`,element:(0,g0.jsx)(CDRChatHome,{})}),",
    "Chat home route",
  );
  code = hardenNativeChatPage(code, bundlePath).source;
  verifyPage(code, bundlePath);
  return { source: code, changed: true };
}

function patchWorkHome(source, bundlePath) {
  if (source.includes(HOME_MARKER)) {
    verifyWorkHome(source, bundlePath);
    return { source, changed: false };
  }
  let code = transformFunction(source, "j", (body) => {
    let next = replaceExactly(body, "let{announcementStorybookOverride:i}=r", "let{announcementStorybookOverride:i,chatMode:CDRChatMode=!1}=r", "Chat home prop");
    next = replaceExactly(
      next,
      "J;t[41]===s?J=t[42]:(J=e=>{s(ne(e),{replace:!0})},t[41]=s,t[42]=J);",
      "J=e=>{s(`${ne(e)}${CDRChatMode?`?mode=chat`:``}`,{replace:!0})};",
      "Chat submit route",
    );
    next = replaceExactly(next, "conversationOrigin:`tpp`", "conversationOrigin:CDRChatMode?null:`tpp`", "non-TPP Chat model source");
    return next;
  }, bundlePath);
  code = replaceExactly(code, "function j(e){", `/* ${HOME_MARKER} */function j(e){`, "Chat home marker");
  verifyWorkHome(code, bundlePath);
  return { source: code, changed: true };
}

function patchCss(source, bundlePath) {
  if (!source.includes("--color-token-main-surface-primary") || !source.includes(".electron-dark")) {
    throw new Error(`${relPath(bundlePath)} is not the expected global theme bundle`);
  }
  // Chat reuses Work colors — strip any leftover Chat-only accent theme.
  if (source.includes(CSS_MARKER) || source.includes('data-codex-product-mode="chat"')) {
    const stripped = stripChatTheme(source);
    verifyCss(stripped.source, bundlePath);
    return stripped;
  }
  verifyCss(source, bundlePath);
  return { source, changed: false };
}

function verifyPage(source, bundlePath) {
  const ast = parseBundle(source, bundlePath);
  if (countOccurrences(source, PAGE_MARKER) !== 1) throw new Error(`${relPath(bundlePath)} Chat page marker invalid`);
  for (const name of ["ROe", "NOe", "MOe", "mje", "IAe", "eAe", "OL", "Fke", "Uke", "CDRChatHome"]) {
    findFunction(ast, name, bundlePath);
  }
  const required = [
    "onSelect:()=>t(`chat`)",
    "path:`/chat`",
    "Jhe({tppOnly:!CDRChatMode})",
    "visibleProjects.map",
    "route:`${e.route}?mode=chat`",
    "sidebarMode:CDRChatMode?`work`:`codex`",
    "F=CDRChatMode||l===`STEPS_PROSE`?`work`:`codex`",
    "heading:`Tasks`",
    "allowCodexThreadProjectDrag:!CDRChatMode",
    "CDRChatQueryClient.removeQueries({type:`inactive`})",
    "CDRChatQueryClient.resetQueries({type:`active`})",
    "CDRChatAccountChanging&&(CDRChatQueryClient.removeQueries({type:`inactive`})",
    "CDRChatMode&&CDRChatAccountChanging?null:",
    "CDRChatMode?`chat:${CDRChatSettledAccount??`anonymous`}`:`codex`",
    'if(i)return null;',
    '"chat:"+(n??"anonymous")',
    "chatMode:CDRChatMode,expandable:!0",
    "item:e,chatMode:CDRChatMode",
    "CDRChatRoute=e=>CDRChatMode?",
    SAFE_OL_PROJECT_DISPLAY,
    SAFE_FKE_PROJECT_DISPLAY,
    SAFE_CHAT_HOME_GATE,
    SAFE_PROJECT_TITLE,
  ];
  for (const item of required) {
    if (!source.includes(item)) throw new Error(`${relPath(bundlePath)} missing native Chat invariant: ${item}`);
  }
  for (const forbidden of [
    "data-codex-product-mode",
    "sidebarMode:CDRChatMode?`chat`",
    "heading:CDRChatMode?`Chats`",
    "if(CDRChatMode)te=G",
    "r!==`chat`&&b?",
    "r===`chat`?null:(0,XF.jsx)(fOe",
  ]) {
    if (source.includes(forbidden)) {
      throw new Error(`${relPath(bundlePath)} still forks Chat chrome away from Work: ${forbidden}`);
    }
  }
  if (source.includes("n.project.gizmo.display.theme") || source.includes("u.gizmo.display.theme")) {
    throw new Error(`${relPath(bundlePath)} still reads ChatGPT project display.theme unsafely`);
  }
  if (source.includes("e.gizmo.display.name.trim()")) {
    throw new Error(`${relPath(bundlePath)} still reads ChatGPT project display.name unsafely`);
  }
  if (source.includes(UNSAFE_CHAT_HOME_GATE)) {
    throw new Error(`${relPath(bundlePath)} Chat home still treats loading as an error`);
  }
  if (source.includes("persist:codex-chatgpt-live") || source.includes("CodexDedicatedChatSurface")) {
    throw new Error(`${relPath(bundlePath)} still contains legacy webview Chat code`);
  }
  const modeFunction = source.slice(findFunction(ast, "mje", bundlePath).start, findFunction(ast, "mje", bundlePath).end);
  if (/Iee\([^)]*,\s*e===`chat`/.test(modeFunction)) {
    throw new Error(`${relPath(bundlePath)} routes Chat through conversationDetailMode`);
  }
  if (modeFunction.includes("let ce;")) {
    throw new Error(`${relPath(bundlePath)} shadows the Chat route hook with a sidebar cache binding`);
  }
  const projectRow = source.slice(findFunction(ast, "Uke", bundlePath).start, findFunction(ast, "Uke", bundlePath).end);
  if (countOccurrences(projectRow, "CDRChatRoute(dt(") !== 2 || /\b[ei]\.route\b/.test(projectRow)) {
    throw new Error(`${relPath(bundlePath)} nested Chat project routes are not derived safely in both row branches`);
  }
  const chatHome = source.slice(findFunction(ast, "CDRChatHome", bundlePath).start, findFunction(ast, "CDRChatHome", bundlePath).end);
  if (chatHome.indexOf("if(i)return null") > chatHome.indexOf("T0")) {
    throw new Error(`${relPath(bundlePath)} mounts Chat home before account cache isolation settles`);
  }
  const nav = source.slice(findFunction(ast, "MOe", bundlePath).start, findFunction(ast, "MOe", bundlePath).end);
  if (nav.includes("r===`codex`&&n?(0,XF.jsx)(cOe")) {
    throw new Error(`${relPath(bundlePath)} still renders the standalone Quick Chat row`);
  }
}

function verifyWorkHome(source, bundlePath) {
  parseBundle(source, bundlePath);
  if (countOccurrences(source, HOME_MARKER) !== 1) throw new Error(`${relPath(bundlePath)} Chat home marker invalid`);
  for (const item of [
    "chatMode:CDRChatMode=!1",
    "conversationOrigin:CDRChatMode?null:`tpp`",
    "CDRChatMode?`?mode=chat`:``",
  ]) {
    if (!source.includes(item)) throw new Error(`${relPath(bundlePath)} missing Chat home invariant: ${item}`);
  }
  if (!source.includes("onSubmitAccepted:J")) throw new Error(`${relPath(bundlePath)} Chat submit callback is disconnected`);
}

function verifyCss(source, bundlePath) {
  if (source.includes(CSS_MARKER) || source.includes('data-codex-product-mode="chat"')) {
    throw new Error(`${relPath(bundlePath)} still contains Chat-only theme overrides`);
  }
  if (!source.includes("--color-token-main-surface-primary") || !source.includes(".electron-dark")) {
    throw new Error(`${relPath(bundlePath)} is not the expected global theme bundle`);
  }
}

function findOne(directory, predicate, label) {
  const matches = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
    .map((name) => path.join(directory, name))
    .filter((filePath) => predicate(fs.readFileSync(filePath, "utf8"), filePath));
  if (matches.length !== 1) throw new Error(`${label}: expected one candidate, found ${matches.length}`);
  return { path: matches[0], source: fs.readFileSync(matches[0], "utf8") };
}

function locateTargets(platform = SUPPORTED_PLATFORM) {
  if (platform !== SUPPORTED_PLATFORM) {
    throw new Error(`Native Chat mode currently supports only ${SUPPORTED_PLATFORM} 26.707.91948`);
  }
  const assets = path.join(SRC_DIR, platform, "_asar", "webview", "assets");
  if (!fs.existsSync(assets)) throw new Error(`${platform}: extracted webview assets are missing`);
  const page = findOne(assets, (source) =>
    source.includes(PAGE_MARKER) || (
      source.includes("function ROe(") &&
      source.includes("function mje(") &&
      source.includes("sidebarElectron.productMode.chatGptWork.plainText")
    ), `${platform} native app page`);
  const home = findOne(assets, (source) =>
    source.includes(HOME_MARKER) || (
      source.includes("function j(") &&
      source.includes("chatgptConversations.home.hero") &&
      source.includes("conversationOrigin:`tpp`")
    ), `${platform} Work home page`);
  const css = findOne(assets, (source, filePath) =>
    source.includes(CSS_MARKER) || (
      path.basename(filePath).startsWith("app-") &&
      source.includes("--color-token-main-surface-primary") &&
      source.includes(".electron-dark") &&
      source.includes("#root{height:100vh}")
    ), `${platform} global theme`);
  return { assets, page, home, css };
}

function main() {
  const args = process.argv.slice(2);
  const requested = args.find((arg) => ["mac-x64", "mac-arm64", "win", "unix"].includes(arg));
  const platform = requested ?? SUPPORTED_PLATFORM;
  const checkOnly = args.includes("--check");
  const targets = locateTargets(platform);
  const nextPage = patchPage(targets.page.source, targets.page.path);
  const nextHome = patchWorkHome(targets.home.source, targets.home.path);
  const nextCss = patchCss(targets.css.source, targets.css.path);
  for (const target of [targets.page, targets.home, targets.css]) {
    console.log(`  [${platform}] ${relPath(target.path)}`);
  }
  if (!nextPage.changed && !nextHome.changed && !nextCss.changed) {
    console.log("    [ok] native Chat mode already installed and verified");
    return;
  }
  if (checkOnly) {
    console.log("    [?] native Chat mode would be installed");
    return;
  }
  const entries = [
    { path: targets.page.path, previous: targets.page.source, next: nextPage.source, verify: verifyPage },
    { path: targets.home.path, previous: targets.home.source, next: nextHome.source, verify: verifyWorkHome },
    { path: targets.css.path, previous: targets.css.source, next: nextCss.source, verify: verifyCss },
  ];
  atomicReplaceEntries(entries, { transactionRoot: path.join(SRC_DIR, platform, "_asar") });
  console.log("    [ok] installed native Chat routing, history, and models atomically");
}

module.exports = {
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
};

if (require.main === module) main();


