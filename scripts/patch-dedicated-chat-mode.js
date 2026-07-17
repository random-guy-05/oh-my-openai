#!/usr/bin/env node
/**
 * Promote the native ChatGPT client already shipped in the official Intel app
 * into a third Codex / ChatGPT Work / Chat product mode.
 *
 * Chat and ChatGPT Work share the same Work chrome and the same ChatGPT
 * conversation IDs. Mode switches stay on the open thread; Chat uses origin
 * null (ChatGPT usage) and Work uses origin tpp. Codex/local threads opened
 * under Chat or Work auto-map to ChatGPT with seeded context; Codex mode can
 * reverse-map back to /local/:id.
 *
 * Supported upstream: macOS Intel 26.707.91948 (build 5440).
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { relPath, SRC_DIR } = require("./patch-util");

const SUPPORTED_PLATFORM = "mac-x64";
const PAGE_MARKER = "codex-rebuild:native-chat-mode-v13";
const PAGE_MARKER_V12 = "codex-rebuild:native-chat-mode-v12";
const PAGE_MARKER_V11 = "codex-rebuild:native-chat-mode-v11";
const PAGE_MARKER_V10 = "codex-rebuild:native-chat-mode-v10";
const PAGE_MARKER_V9 = "codex-rebuild:native-chat-mode-v9";
const PAGE_MARKER_V8 = "codex-rebuild:native-chat-mode-v8";
const HOME_MARKER = "codex-rebuild:native-chat-home-v13";
const HOME_MARKER_V12 = "codex-rebuild:native-chat-home-v12";
const HOME_MARKER_V8 = "codex-rebuild:native-chat-home-v8";
const OPEN_THREAD_MARKER = "codex-rebuild:chat-codex-handoff-v13";
const OPEN_THREAD_MARKER_V12 = "codex-rebuild:chat-codex-handoff-v12";
const ORIGIN_MARKER = "codex-rebuild:chat-origin-v13";
const ORIGIN_MARKER_V12 = "codex-rebuild:chat-origin-v12";
const CSS_MARKER = "codex-rebuild:native-chat-theme-v8";

const THREAD_MAP_HELPERS = `function CDRReadThreadMap(){let m={byLocal:{},byChat:{}};try{let cur=JSON.parse(localStorage.getItem(\`cdr-thread-map\`)||\`{}\`);if(cur&&typeof cur===\`object\`){m.byLocal=cur.byLocal&&typeof cur.byLocal===\`object\`?cur.byLocal:{};m.byChat=cur.byChat&&typeof cur.byChat===\`object\`?cur.byChat:{}}let old=JSON.parse(localStorage.getItem(\`cdr-codex-chatgpt-map\`)||\`{}\`);if(old&&typeof old===\`object\`){for(let[k,v]of Object.entries(old)){if(typeof k===\`string\`&&typeof v===\`string\`){if(!m.byLocal[k])m.byLocal[k]=v;if(!m.byChat[v])m.byChat[v]=k}}} }catch{}return m}function CDRWriteThreadMap(localKey,chatId){if(!localKey||!chatId)return;try{let m=CDRReadThreadMap();m.byLocal[localKey]=chatId;m.byChat[chatId]=localKey;localStorage.setItem(\`cdr-thread-map\`,JSON.stringify(m));let old=JSON.parse(localStorage.getItem(\`cdr-codex-chatgpt-map\`)||\`{}\`);old[localKey]=chatId;localStorage.setItem(\`cdr-codex-chatgpt-map\`,JSON.stringify(old))}catch{}}function CDRProductMode(){try{return localStorage.getItem(\`cdr-product-mode\`)}catch{return null}}function CDRBuildCodexSeed(e,t){try{let p=mt(t);if(p?.kind===\`local\`){let k=e.get(Li,p.threadId),snap=k!=null?e.get(Mn,k):null,turns=snap?.turns||snap?.items||snap?.history||[],lines=[];if(Array.isArray(turns)){for(let turn of turns.slice(-12)){let texts=[];let items=Array.isArray(turn?.items)?turn.items:Array.isArray(turn)?turn:[turn];for(let item of items){if(!item||typeof item!==\`object\`)continue;for(let key of[\`text\`,\`content\`,\`agentMessage\`,\`userMessage\`,\`message\`]){let val=item[key];if(typeof val===\`string\`&&val.trim())texts.push(val.trim());else if(Array.isArray(val))for(let c of val){if(typeof c===\`string\`&&c.trim())texts.push(c.trim());else if(c&&typeof c.text===\`string\`&&c.text.trim())texts.push(c.text.trim())}}}if(texts.length)lines.push(texts.join(\`\\n\`).slice(0,1200))}if(lines.length)return \`Continuing this Codex thread. Prior context:\\n\\n\`+lines.join(\`\\n\\n---\\n\\n\`).slice(0,12000)+\`\\n\\nPlease continue from here.\`}}}catch{}return \`Continue Codex thread \${t}. Use prior project context and proceed.\`}`;

const OPEN_THREAD_SOURCE =
  "function Tc(e,t,n,r){Ec(e,t);let i=mn(t);if(i!=null){n(i);return}r(S(t))}";
const OPEN_THREAD_V12 =
  "function Tc(e,t,n,r){/* codex-rebuild:chat-codex-handoff-v12 */if((()=>{try{return localStorage.getItem(`cdr-product-mode`)===`chat`}catch{return!1}})()){let CDRMapped=null;try{CDRMapped=JSON.parse(localStorage.getItem(`cdr-codex-chatgpt-map`)||`{}`)[t]||null}catch{}if(CDRMapped){r(`/work/conversation/${encodeURIComponent(CDRMapped)}?mode=chat`);return}r(`/chat?mode=chat`,{state:{prefillPrompt:`Continue this Codex thread in ChatGPT.`,cdrContinueThreadKey:t}});return}Ec(e,t);let i=mn(t);if(i!=null){n(i);return}r(S(t))}";
const OPEN_THREAD_REPLACEMENT =
  `function Tc(e,t,n,r){/* ${OPEN_THREAD_MARKER} */${THREAD_MAP_HELPERS};let CDRMode=CDRProductMode();if(CDRMode===\`chat\`||CDRMode===\`work\`){let map=CDRReadThreadMap(),mapped=map.byLocal[t]||null;if(mapped){r(\`/work/conversation/\${encodeURIComponent(mapped)}\${CDRMode===\`chat\`?\`?mode=chat\`:\`\`}\`);return}(async()=>{try{Ec(e,t)}catch{}let seed=CDRBuildCodexSeed(e,t),home=CDRMode===\`chat\`?\`/chat?mode=chat\`:\`/\`;r(home,{state:{prefillPrompt:seed,cdrContinueThreadKey:t,cdrAutoSubmit:!0}})})();return}Ec(e,t);let i=mn(t);if(i!=null){n(i);return}r(S(t))}`;

const KM_ORIGIN_SOURCE =
  "m=t.conversationOrigin===void 0?e.get(yl,u):t.conversationOrigin";
const KM_ORIGIN_V12 =
  "m=((o)=>{/* codex-rebuild:chat-origin-v12 */try{if(localStorage.getItem(`cdr-product-mode`)===`chat`&&o===`tpp`)return null}catch{}return o})(t.conversationOrigin===void 0?e.get(yl,u):t.conversationOrigin)";
const KM_ORIGIN_REPLACEMENT =
  `m=((o)=>{/* ${ORIGIN_MARKER} */try{let mode=localStorage.getItem(\`cdr-product-mode\`);if(mode===\`chat\`)return null;if(mode===\`work\`)return \`tpp\`}catch{}return o})(t.conversationOrigin===void 0?e.get(yl,u):t.conversationOrigin)`;
const LP_ORIGIN_SOURCE = "f=n===void 0?e.get(yl,t):n";
const LP_ORIGIN_V12 =
  "f=((o)=>{try{if(localStorage.getItem(`cdr-product-mode`)===`chat`&&o===`tpp`)return null}catch{}return o})(n===void 0?e.get(yl,t):n)";
const LP_ORIGIN_REPLACEMENT =
  `f=((o)=>{try{let mode=localStorage.getItem(\`cdr-product-mode\`);if(mode===\`chat\`)return null;if(mode===\`work\`)return \`tpp\`}catch{}return o})(n===void 0?e.get(yl,t):n)`;

const HOME_SUBMIT_SOURCE =
  "J=e=>{s(`${ne(e)}${CDRChatMode?`?mode=chat`:``}`,{replace:!0})};";
const HOME_SUBMIT_V12 =
  "J=e=>{try{let CDRKey=u?.cdrContinueThreadKey;if(CDRKey){let CDRMap=JSON.parse(localStorage.getItem(`cdr-codex-chatgpt-map`)||`{}`);CDRMap[CDRKey]=e;localStorage.setItem(`cdr-codex-chatgpt-map`,JSON.stringify(CDRMap))}}catch{}s(`${ne(e)}${CDRChatMode?`?mode=chat`:``}`,{replace:!0})};";
const HOME_SUBMIT_REPLACEMENT =
  "J=e=>{try{let CDRKey=u?.cdrContinueThreadKey;if(CDRKey){let m={byLocal:{},byChat:{}};try{let cur=JSON.parse(localStorage.getItem(`cdr-thread-map`)||`{}`);if(cur&&typeof cur===`object`){m.byLocal=cur.byLocal&&typeof cur.byLocal===`object`?cur.byLocal:{};m.byChat=cur.byChat&&typeof cur.byChat===`object`?cur.byChat:{}}}catch{}m.byLocal[CDRKey]=e;m.byChat[e]=CDRKey;localStorage.setItem(`cdr-thread-map`,JSON.stringify(m));let old=JSON.parse(localStorage.getItem(`cdr-codex-chatgpt-map`)||`{}`);old[CDRKey]=e;localStorage.setItem(`cdr-codex-chatgpt-map`,JSON.stringify(old))}}catch{}s(`${ne(e)}${CDRChatMode?`?mode=chat`:``}`,{replace:!0})};";

const HOME_AUTOSUBMIT_ANCHOR =
  "X=(0,N.jsx)(ge,{className:`w-full`,conversationOrigin:CDRChatMode?null:`tpp`,isHomeMenu:!0,prompt:b,showError:!0,onFileDropTargetChange:W,onPromptChange:O,onUserInput:G,projectId:K,projectName:q,onSubmitAccepted:J,onProjectChange:Y})";
const HOME_AUTOSUBMIT_REPLACEMENT =
  "X=(0,N.jsx)(ge,{className:`w-full`,conversationOrigin:CDRChatMode?null:`tpp`,isHomeMenu:!0,prompt:b,showError:!0,autoSubmit:u?.cdrAutoSubmit===!0,onFileDropTargetChange:W,onPromptChange:O,onUserInput:G,projectId:K,projectName:q,onSubmitAccepted:J,onProjectChange:Y})";

const HS_DESTRUCTURE_SOURCE =
  "showLockdownSlashCommand:k}=e,A=a===void 0?!0:a";
const HS_DESTRUCTURE_REPLACEMENT =
  "showLockdownSlashCommand:k,autoSubmit:CDRAutoSubmit=!1}=e,A=a===void 0?!0:a";
const HS_SUBMIT_ANCHOR = "t[106]=_t):_t=t[106];let vt;";
const HS_SUBMIT_REPLACEMENT =
  "t[106]=_t):_t=t[106];(0,vS.useEffect)(()=>{if(CDRAutoSubmit!==!0)return;let p=(typeof C==`string`&&C.trim()?C:Oe??``).trim();if(!p)return;try{let k=`cdr-auto-submitted:`+(te??`home`);if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,`1`)}catch{}Promise.resolve().then(()=>_t(p))},[CDRAutoSubmit,_t,C,Oe,te]);let vt;";

const CHAT_HOME_ROUTE = "/chat?mode=chat";
const SITES_NAV_CODEX_ONLY =
  "t&&r===`codex`&&!u?(0,XF.jsx)(yf,{electron:!0,children:(0,XF.jsx)(IOe,{})}):null";
const SITES_NAV_WORK_AND_CODEX =
  "t&&(r===`codex`||r===`work`)&&!u?(0,XF.jsx)(yf,{electron:!0,children:(0,XF.jsx)(IOe,{})}):null";
const CHAT_HISTORY_KEYS_V9 =
  "source:`all`});if(CDRChatMode){let e=e=>e.startsWith(`chatgpt:`);j={...j,chatKeys:[...E.visibleProjects.map(e=>xE(e.gizmo.id)),...j.chatKeys].filter(e),pinnedKeys:j.pinnedKeys.filter(e)}}let M=new Map";
const CHAT_HISTORY_KEYS_V10 =
  "source:`all`});if(CDRChatMode){j={...j,chatKeys:[...E.visibleProjects.map(e=>xE(e.gizmo.id)),...j.chatKeys]}}let M=new Map";

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

const SIDEBAR_CLICK_SOURCE =
  "z=({target:t})=>{if(t.source===`chatgpt`){r(t.target.route);return}Aw(e,t.threadKey,i,r)}";
const SIDEBAR_CLICK_REPLACEMENT =
  "z=({target:t})=>{if(t.source===`chatgpt`){let CDRMode=(()=>{try{return localStorage.getItem(`cdr-product-mode`)}catch{return null}})();if(CDRMode===`codex`){let cid=t.target?.conversationId,local=null;try{let m=JSON.parse(localStorage.getItem(`cdr-thread-map`)||`{}`);local=m.byChat?.[cid]||null;if(!local){let old=JSON.parse(localStorage.getItem(`cdr-codex-chatgpt-map`)||`{}`);for(let[k,v]of Object.entries(old))if(v===cid){local=k;break}}}catch{}if(local){Aw(e,local,i,r);return}}r(t.target.route);return}Aw(e,t.threadKey,i,r)}";

const CHAT_MODE_SELECT_V13 =
  "let ae=u?(0,iz.jsxs)(`div`,{className:`ml-2 flex items-center`,children:[(0,iz.jsx)(ROe,{mode:I,onModeSelect:e=>{let CDRPath=CDRChatLocation.pathname||``,CDRSearch=CDRChatLocation.search||``,CDRLocalId=CDRPath.startsWith(`/local/`)?decodeURIComponent(CDRPath.slice(7).split(`?`)[0]):null,CDRChatId=CDRPath.startsWith(`/work/conversation/`)?decodeURIComponent(CDRPath.slice(20).split(`?`)[0]):null;try{localStorage.setItem(`cdr-product-mode`,e)}catch{}if(e===`chat`){if(CDRLocalId){Aw(a,CDRLocalId.includes(`:`)?CDRLocalId:`local:${CDRLocalId}`,qx(),CDRChatNavigate);return}if(CDRChatId){let sp=new URLSearchParams(CDRSearch);sp.set(`mode`,`chat`);CDRChatNavigate({pathname:CDRPath,search:`?`+sp.toString()},{replace:!0});return}if(CDRPath===`/`||CDRPath===``||CDRPath===`/chat`){CDRChatNavigate(`/chat?mode=chat`);return}CDRChatNavigate({pathname:CDRPath,search:CDRSearch.includes(`mode=chat`)?CDRSearch:`${CDRSearch?CDRSearch+`&`:`?`}mode=chat`},{replace:!0});return}Iee(a,e===`work`?vf:Tr);if(e===`work`){if(CDRLocalId){Aw(a,CDRLocalId.includes(`:`)?CDRLocalId:`local:${CDRLocalId}`,qx(),CDRChatNavigate);return}if(CDRChatId){let sp=new URLSearchParams(CDRSearch);sp.delete(`mode`);let q=sp.toString();CDRChatNavigate({pathname:CDRPath,search:q?`?`+q:``},{replace:!0});return}return}if(e===`codex`){if(CDRChatId){let local=null;try{let m=JSON.parse(localStorage.getItem(`cdr-thread-map`)||`{}`);local=m.byChat?.[CDRChatId]||null;if(!local){let old=JSON.parse(localStorage.getItem(`cdr-codex-chatgpt-map`)||`{}`);for(let[k,v]of Object.entries(old))if(v===CDRChatId){local=k;break}}}catch{}if(local){Aw(a,local,qx(),CDRChatNavigate);return}}return}}}),(0,iz.jsx)(vOe,{})]}):null;";
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

const CHAT_HOME_WRAPPER = String.raw`/* ${PAGE_MARKER} */function CDRChatHome(){try{localStorage.setItem(\`cdr-product-mode\`,\`chat\`)}catch{}let{accountId:e}=u_(),t=Yc(),[n,r]=(0,h0.useState)(e),i=n!==e;(0,h0.useLayoutEffect)(()=>{i&&(t.removeQueries({type:\`inactive\`}),void t.resetQueries({type:\`active\`}),r(e))},[e,i,t]);${SAFE_CHAT_HOME_GATE}return(0,g0.jsx)(h0.Suspense,{fallback:null,children:(0,g0.jsx)(T0,{chatMode:!0},"chat:"+(n??"anonymous"))})}`.replaceAll("\\`", "`");

const CHAT_ROUTE_STATE_V8 =
  "a=md(X),CDRChatQueryClient=Yc(),CDRChatLocation=ce(),CDRChatNavigate=Cn(),CDRChatMode=CDRChatLocation.pathname===`/chat`||new URLSearchParams(CDRChatLocation.search).get(`mode`)===`chat`;(0,rz.useEffect)(()=>{let e=document.documentElement;return CDRChatMode?e.setAttribute(`data-codex-product-mode`,`chat`):e.removeAttribute(`data-codex-product-mode`),()=>{e.removeAttribute(`data-codex-product-mode`)}},[CDRChatMode]);let{accountId:o}=u_(),[CDRChatSettledAccount,CDRChatSetSettledAccount]=(0,rz.useState)(o),CDRChatAccountChanging=CDRChatSettledAccount!==o;(0,rz.useLayoutEffect)(()=>{CDRChatAccountChanging&&(CDRChatQueryClient.removeQueries({type:`inactive`}),void CDRChatQueryClient.resetQueries({type:`active`}),CDRChatSetSettledAccount(o))},[o,CDRChatAccountChanging,CDRChatQueryClient]);let ";
const CHAT_ROUTE_STATE_V9 =
  "a=md(X),CDRChatQueryClient=Yc(),CDRChatLocation=ce(),CDRChatNavigate=Cn(),CDRChatMode=CDRChatLocation.pathname===`/chat`||new URLSearchParams(CDRChatLocation.search).get(`mode`)===`chat`;let{accountId:o}=u_(),[CDRChatSettledAccount,CDRChatSetSettledAccount]=(0,rz.useState)(o),CDRChatAccountChanging=CDRChatSettledAccount!==o;(0,rz.useLayoutEffect)(()=>{CDRChatAccountChanging&&(CDRChatQueryClient.removeQueries({type:`inactive`}),void CDRChatQueryClient.resetQueries({type:`active`}),CDRChatSetSettledAccount(o))},[o,CDRChatAccountChanging,CDRChatQueryClient]);let ";
const CHAT_ROUTE_STATE_V10 =
  "a=md(X),CDRChatQueryClient=Yc(),CDRChatLocation=ce(),CDRChatNavigate=Cn(),CDRChatMode=CDRChatLocation.pathname===`/chat`||new URLSearchParams(CDRChatLocation.search).get(`mode`)===`chat`||(()=>{try{return sessionStorage.getItem(`cdr-product-mode`)===`chat`}catch{return!1}})();let{accountId:o}=u_(),[CDRChatSettledAccount,CDRChatSetSettledAccount]=(0,rz.useState)(o),CDRChatAccountChanging=CDRChatSettledAccount!==o;(0,rz.useLayoutEffect)(()=>{CDRChatAccountChanging&&(CDRChatQueryClient.removeQueries({type:`inactive`}),void CDRChatQueryClient.resetQueries({type:`active`}),CDRChatSetSettledAccount(o))},[o,CDRChatAccountChanging,CDRChatQueryClient]);let ";
const CHAT_ROUTE_STATE_V11 =
  "a=md(X),CDRChatQueryClient=Yc(),CDRChatLocation=ce(),CDRChatNavigate=Cn(),CDRChatModeFromRoute=CDRChatLocation.pathname===`/chat`||new URLSearchParams(CDRChatLocation.search).get(`mode`)===`chat`,CDRChatModeStored=(()=>{try{return localStorage.getItem(`cdr-product-mode`)===`chat`}catch{return!1}})(),CDRChatMode=CDRChatModeFromRoute||CDRChatModeStored;(0,rz.useEffect)(()=>{if(!CDRChatModeFromRoute)return;try{localStorage.setItem(`cdr-product-mode`,`chat`)}catch{}},[CDRChatModeFromRoute]);let{accountId:o}=u_(),[CDRChatSettledAccount,CDRChatSetSettledAccount]=(0,rz.useState)(o),CDRChatAccountChanging=CDRChatSettledAccount!==o;(0,rz.useLayoutEffect)(()=>{CDRChatAccountChanging&&(CDRChatQueryClient.removeQueries({type:`inactive`}),void CDRChatQueryClient.resetQueries({type:`active`}),CDRChatSetSettledAccount(o))},[o,CDRChatAccountChanging,CDRChatQueryClient]);let ";
const CHAT_MODE_SELECT_V9 =
  "let ae=u?(0,iz.jsxs)(`div`,{className:`ml-2 flex items-center`,children:[(0,iz.jsx)(ROe,{mode:I,onModeSelect:e=>{if(e===`chat`){CDRChatNavigate(`/chat?mode=chat`);return}Iee(a,e===`work`?vf:Tr),CDRChatMode&&CDRChatNavigate(`/`)}}),(0,iz.jsx)(vOe,{})]}):null;";
const CHAT_MODE_SELECT_V10 =
  "let ae=u?(0,iz.jsxs)(`div`,{className:`ml-2 flex items-center`,children:[(0,iz.jsx)(ROe,{mode:I,onModeSelect:e=>{if(e===`chat`){try{sessionStorage.setItem(`cdr-product-mode`,`chat`)}catch{}CDRChatNavigate(`/chat?mode=chat`);return}try{sessionStorage.removeItem(`cdr-product-mode`)}catch{}Iee(a,e===`work`?vf:Tr),CDRChatMode&&CDRChatNavigate(`/`)}}),(0,iz.jsx)(vOe,{})]}):null;";
const CHAT_MODE_SELECT_V11 =
  "let ae=u?(0,iz.jsxs)(`div`,{className:`ml-2 flex items-center`,children:[(0,iz.jsx)(ROe,{mode:I,onModeSelect:e=>{if(e===`chat`){try{localStorage.setItem(`cdr-product-mode`,`chat`)}catch{}CDRChatNavigate(`/chat?mode=chat`);return}try{localStorage.removeItem(`cdr-product-mode`)}catch{}Iee(a,e===`work`?vf:Tr),CDRChatMode&&CDRChatNavigate(`/`)}}),(0,iz.jsx)(vOe,{})]}):null;";

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

  for (const legacy of [PAGE_MARKER_V8, PAGE_MARKER_V9, PAGE_MARKER_V10, PAGE_MARKER_V11, PAGE_MARKER_V12]) {
    if (next.includes(legacy)) {
      next = replaceExactly(next, legacy, PAGE_MARKER, `Chat page marker from ${legacy}`);
      changed = true;
    }
  }

  if (next.includes(CHAT_ROUTE_STATE_V8)) {
    next = replaceExactly(next, CHAT_ROUTE_STATE_V8, CHAT_ROUTE_STATE_V11, "Chat sticky mode from v8");
    changed = true;
  }
  if (next.includes(CHAT_ROUTE_STATE_V9)) {
    next = replaceExactly(next, CHAT_ROUTE_STATE_V9, CHAT_ROUTE_STATE_V11, "Chat sticky mode from v9");
    changed = true;
  }
  if (next.includes(CHAT_ROUTE_STATE_V10)) {
    next = replaceExactly(next, CHAT_ROUTE_STATE_V10, CHAT_ROUTE_STATE_V11, "Chat sticky mode from v10");
    changed = true;
  }
  for (const [from, label] of [
    [CHAT_MODE_SELECT_V9, "Chat mode select from v9"],
    [CHAT_MODE_SELECT_V10, "Chat mode select from v10"],
    [CHAT_MODE_SELECT_V11, "Chat mode select from v11"],
  ]) {
    if (next.includes(from)) {
      next = replaceExactly(next, from, CHAT_MODE_SELECT_V13, label);
      changed = true;
    }
  }
  if (next.includes(SIDEBAR_CLICK_SOURCE)) {
    next = replaceExactly(next, SIDEBAR_CLICK_SOURCE, SIDEBAR_CLICK_REPLACEMENT, "Codex reverse-map ChatGPT opens");
    changed = true;
  }
  if (
    next.includes("function CDRChatHome(){let{accountId:e}=u_()") &&
    !next.includes("function CDRChatHome(){try{localStorage.setItem(`cdr-product-mode`,`chat`)}")
  ) {
    next = replaceExactly(
      next,
      "function CDRChatHome(){let{accountId:e}=u_()",
      "function CDRChatHome(){try{localStorage.setItem(`cdr-product-mode`,`chat`)}catch{}let{accountId:e}=u_()",
      "persist Chat mode on Chat home",
    );
    changed = true;
  }
  if (next.includes(CHAT_HISTORY_KEYS_V9)) {
    next = replaceExactly(next, CHAT_HISTORY_KEYS_V9, CHAT_HISTORY_KEYS_V10, "include Codex history in Chat");
    changed = true;
  }
  if (next.includes(SITES_NAV_CODEX_ONLY)) {
    next = replaceExactly(next, SITES_NAV_CODEX_ONLY, SITES_NAV_WORK_AND_CODEX, "Sites nav in Work/Chat");
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
  if (next.includes("e.startsWith(`chatgpt:`)") && next.includes("pinnedKeys:j.pinnedKeys.filter(e)")) {
    throw new Error(`${relPath(bundlePath)} still hides Codex threads from Chat history`);
  }
  if (next.includes(SITES_NAV_CODEX_ONLY)) {
    throw new Error(`${relPath(bundlePath)} still hides Sites outside Codex mode`);
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
  if (
    source.includes(PAGE_MARKER) ||
    source.includes(PAGE_MARKER_V12) ||
    source.includes(PAGE_MARKER_V11) ||
    source.includes(PAGE_MARKER_V10) ||
    source.includes(PAGE_MARKER_V9) ||
    source.includes(PAGE_MARKER_V8)
  ) {
    let next = source;
    let changed = false;
    if (
      source.includes(PAGE_MARKER_V8) ||
      source.includes(PAGE_MARKER_V9) ||
      source.includes(PAGE_MARKER_V10) ||
      source.includes(PAGE_MARKER_V11) ||
      source.includes(PAGE_MARKER_V12) ||
      source.includes(CHAT_MODE_SELECT_V11) ||
      source.includes(SIDEBAR_CLICK_SOURCE) ||
      source.includes("sidebarMode:CDRChatMode?`chat`") ||
      source.includes("data-codex-product-mode") ||
      source.includes(CHAT_HISTORY_KEYS_V9) ||
      source.includes(SITES_NAV_CODEX_ONLY) ||
      source.includes(CHAT_ROUTE_STATE_V9) ||
      source.includes(CHAT_ROUTE_STATE_V10) ||
      source.includes(CHAT_MODE_SELECT_V9) ||
      source.includes(CHAT_MODE_SELECT_V10) ||
      source.includes("sessionStorage.getItem(`cdr-product-mode`)") ||
      source.includes("localStorage.removeItem(`cdr-product-mode`)")
    ) {
      const aligned = alignChatUiWithWork(next, bundlePath);
      next = aligned.source;
      changed = changed || aligned.changed;
    }
    if (next.includes(CHAT_MODE_SELECT_V11)) {
      next = replaceExactly(next, CHAT_MODE_SELECT_V11, CHAT_MODE_SELECT_V13, "non-destructive mode switch v13");
      changed = true;
    }
    if (next.includes(SIDEBAR_CLICK_SOURCE)) {
      next = replaceExactly(next, SIDEBAR_CLICK_SOURCE, SIDEBAR_CLICK_REPLACEMENT, "Codex reverse-map ChatGPT opens");
      changed = true;
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
  // Sites is upstream Codex-only; also show it in Work (and therefore Chat).
  code = transformFunction(code, "MOe", (body) => {
    let next = replaceExactly(body, "r===`codex`&&n?(0,XF.jsx)(cOe,{}):null", "null", "standalone Quick Chat row removal");
    next = replaceExactly(next, SITES_NAV_CODEX_ONLY, SITES_NAV_WORK_AND_CODEX, "Sites nav in Work/Chat");
    return next;
  }, bundlePath);

  code = transformFunction(code, "mje", (body) => {
    let next = replaceExactly(
      body,
      "a=md(X),{accountId:o}=u_(),",
      CHAT_ROUTE_STATE_V11,
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
      CHAT_MODE_SELECT_V13,
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
      "source:`all`});if(CDRChatMode){j={...j,chatKeys:[...E.visibleProjects.map(e=>xE(e.gizmo.id)),...j.chatKeys]}}let M=new Map",
      "Chat history includes Codex + ChatGPT keys",
    );
    // Keep Work's "Tasks" heading and section switch — identical chrome.
    next = replaceExactly(next, "allowCodexThreadProjectDrag:!0", "allowCodexThreadProjectDrag:!CDRChatMode", "Chat drag isolation");
    next = replaceExactly(next, "chatGptSource:E,codexProjectKindByThreadKey:k", "chatGptSource:E,chatMode:CDRChatMode,codexProjectKindByThreadKey:k", "Chat project row mode", 2);
    if (next.includes(SIDEBAR_CLICK_SOURCE)) {
      next = replaceExactly(next, SIDEBAR_CLICK_SOURCE, SIDEBAR_CLICK_REPLACEMENT, "Codex reverse-map ChatGPT opens");
    }
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
  let code = source;
  let changed = false;
  for (const legacy of [HOME_MARKER_V8, HOME_MARKER_V12]) {
    if (code.includes(legacy) && !code.includes(HOME_MARKER)) {
      code = replaceExactly(code, legacy, HOME_MARKER, `Chat home marker from ${legacy}`);
      changed = true;
    }
  }
  if (
    code.includes(HOME_MARKER) &&
    code.includes(HOME_SUBMIT_REPLACEMENT) &&
    code.includes(HOME_AUTOSUBMIT_REPLACEMENT) &&
    code.includes("conversationOrigin:CDRChatMode?null:`tpp`") &&
    code.includes("cdr-thread-map")
  ) {
    verifyWorkHome(code, bundlePath);
    return { source: code, changed };
  }

  code = transformFunction(code, "j", (body) => {
    let next = body;
    if (!next.includes("chatMode:CDRChatMode=!1")) {
      next = replaceExactly(
        next,
        "let{announcementStorybookOverride:i}=r",
        "let{announcementStorybookOverride:i,chatMode:CDRChatMode=!1}=r",
        "Chat home prop",
      );
    }
    if (next.includes("J;t[41]===s?J=t[42]:(J=e=>{s(ne(e),{replace:!0})},t[41]=s,t[42]=J);")) {
      next = replaceExactly(
        next,
        "J;t[41]===s?J=t[42]:(J=e=>{s(ne(e),{replace:!0})},t[41]=s,t[42]=J);",
        HOME_SUBMIT_REPLACEMENT,
        "Chat submit route with bidirectional map",
      );
    }
    if (next.includes(HOME_SUBMIT_SOURCE)) {
      next = replaceExactly(next, HOME_SUBMIT_SOURCE, HOME_SUBMIT_REPLACEMENT, "Chat submit bidirectional map");
    }
    if (next.includes(HOME_SUBMIT_V12)) {
      next = replaceExactly(next, HOME_SUBMIT_V12, HOME_SUBMIT_REPLACEMENT, "upgrade home submit map v13");
    }
    if (next.includes("conversationOrigin:`tpp`")) {
      next = replaceExactly(next, "conversationOrigin:`tpp`", "conversationOrigin:CDRChatMode?null:`tpp`", "non-TPP Chat model source");
    }
    if (next.includes(HOME_AUTOSUBMIT_ANCHOR)) {
      next = replaceExactly(next, HOME_AUTOSUBMIT_ANCHOR, HOME_AUTOSUBMIT_REPLACEMENT, "home auto-submit for Codex seed");
    }
    return next;
  }, bundlePath);

  if (!code.includes(HOME_MARKER)) {
    if (code.includes(`/* ${HOME_MARKER_V8} */function j(e){`) || code.includes(`/* ${HOME_MARKER_V12} */function j(e){`)) {
      code = code.replace(`/* ${HOME_MARKER_V8} */function j(e){`, `/* ${HOME_MARKER} */function j(e){`);
      code = code.replace(`/* ${HOME_MARKER_V12} */function j(e){`, `/* ${HOME_MARKER} */function j(e){`);
    } else {
      code = replaceExactly(code, "function j(e){", `/* ${HOME_MARKER} */function j(e){`, "Chat home marker");
    }
  }
  verifyWorkHome(code, bundlePath);
  return { source: code, changed: true };
}

function patchOpenThread(source, bundlePath) {
  if (source.includes(OPEN_THREAD_MARKER)) {
    verifyOpenThread(source, bundlePath);
    return { source, changed: false };
  }
  let code = source;
  if (code.includes(OPEN_THREAD_V12) || code.includes(OPEN_THREAD_MARKER_V12)) {
    // Replace from function Tc through end of v12 body by finding marker and rewriting whole function
    if (code.includes(OPEN_THREAD_V12)) {
      code = replaceExactly(code, OPEN_THREAD_V12, OPEN_THREAD_REPLACEMENT, "upgrade Codex handoff v13");
    } else {
      // Marker present with slightly different body — fall back to source replace of original if present
      throw new Error(`${relPath(bundlePath)} has v12 handoff marker but unexpected body; resync assets`);
    }
  } else if (code.includes(OPEN_THREAD_SOURCE)) {
    code = replaceExactly(code, OPEN_THREAD_SOURCE, OPEN_THREAD_REPLACEMENT, "Chat Codex→ChatGPT handoff");
  } else {
    throw new Error(`${relPath(bundlePath)} missing Codex open-thread helper Tc`);
  }
  verifyOpenThread(code, bundlePath);
  return { source: code, changed: true };
}

function patchChatOrigin(source, bundlePath) {
  let code = source;
  let changed = false;
  if (code.includes(ORIGIN_MARKER) && code.includes(LP_ORIGIN_REPLACEMENT) && code.includes(HS_SUBMIT_REPLACEMENT)) {
    verifyChatOrigin(code, bundlePath);
    return { source: code, changed: false };
  }

  if (code.includes(KM_ORIGIN_V12)) {
    code = replaceExactly(code, KM_ORIGIN_V12, KM_ORIGIN_REPLACEMENT, "upgrade origin override v13");
    changed = true;
  } else if (code.includes(KM_ORIGIN_SOURCE)) {
    code = replaceExactly(code, KM_ORIGIN_SOURCE, KM_ORIGIN_REPLACEMENT, "Chat/Work origin follows sticky mode on submit");
    changed = true;
  } else if (!code.includes(KM_ORIGIN_REPLACEMENT)) {
    throw new Error(`${relPath(bundlePath)} missing km conversationOrigin assignment`);
  }

  if (code.includes(LP_ORIGIN_V12)) {
    code = replaceExactly(code, LP_ORIGIN_V12, LP_ORIGIN_REPLACEMENT, "upgrade prepare-origin v13");
    changed = true;
  } else if (code.includes(LP_ORIGIN_SOURCE) && !code.includes(LP_ORIGIN_REPLACEMENT)) {
    code = replaceExactly(code, LP_ORIGIN_SOURCE, LP_ORIGIN_REPLACEMENT, "Chat/Work origin follows sticky mode on prepare");
    changed = true;
  }

  if (code.includes(HS_DESTRUCTURE_SOURCE)) {
    code = replaceExactly(code, HS_DESTRUCTURE_SOURCE, HS_DESTRUCTURE_REPLACEMENT, "home composer autoSubmit prop");
    changed = true;
  }
  if (code.includes(HS_SUBMIT_ANCHOR)) {
    code = replaceExactly(code, HS_SUBMIT_ANCHOR, HS_SUBMIT_REPLACEMENT, "home composer auto-submit effect");
    changed = true;
  }

  verifyChatOrigin(code, bundlePath);
  return { source: code, changed };
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
    "localStorage.getItem(`cdr-product-mode`)===`chat`",
    "localStorage.setItem(`cdr-product-mode`,`chat`)",
    "CDRChatModeFromRoute||CDRChatModeStored",
    "localStorage.setItem(`cdr-product-mode`,e)",
    "CDRLocalId",
    "CDRChatId",
    "cdr-thread-map",
    SIDEBAR_CLICK_REPLACEMENT.slice(0, 80),
    SITES_NAV_WORK_AND_CODEX,
    CHAT_HISTORY_KEYS_V10,
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
    SITES_NAV_CODEX_ONLY,
    "e.startsWith(`chatgpt:`)",
    "sessionStorage.getItem(`cdr-product-mode`)",
    CHAT_MODE_SELECT_V11,
    "CDRChatNavigate(`/chat?mode=chat`);return}try{localStorage.removeItem(`cdr-product-mode`)",
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
    "cdrContinueThreadKey",
    "cdr-thread-map",
    "cdrAutoSubmit",
    "autoSubmit:u?.cdrAutoSubmit===!0",
  ]) {
    if (!source.includes(item)) throw new Error(`${relPath(bundlePath)} missing Chat home invariant: ${item}`);
  }
  if (!source.includes("onSubmitAccepted:J")) throw new Error(`${relPath(bundlePath)} Chat submit callback is disconnected`);
}

function verifyOpenThread(source, bundlePath) {
  parseBundle(source, bundlePath);
  if (countOccurrences(source, OPEN_THREAD_MARKER) !== 1) {
    throw new Error(`${relPath(bundlePath)} Chat Codex handoff marker invalid`);
  }
  if (source.includes(OPEN_THREAD_SOURCE) || source.includes(OPEN_THREAD_MARKER_V12)) {
    throw new Error(`${relPath(bundlePath)} still has pre-v13 Codex handoff`);
  }
  for (const item of [
    "CDRReadThreadMap",
    "CDRBuildCodexSeed",
    "cdrAutoSubmit:!0",
    "/work/conversation/",
    "cdrContinueThreadKey",
    "CDRMode===`chat`||CDRMode===`work`",
  ]) {
    if (!source.includes(item)) throw new Error(`${relPath(bundlePath)} missing Codex handoff invariant: ${item}`);
  }
}

function verifyChatOrigin(source, bundlePath) {
  parseBundle(source, bundlePath);
  if (countOccurrences(source, ORIGIN_MARKER) !== 1) {
    throw new Error(`${relPath(bundlePath)} Chat origin marker invalid`);
  }
  if (source.includes(KM_ORIGIN_SOURCE) || source.includes(ORIGIN_MARKER_V12)) {
    throw new Error(`${relPath(bundlePath)} still has pre-v13 origin override`);
  }
  if (!source.includes(LP_ORIGIN_REPLACEMENT)) {
    throw new Error(`${relPath(bundlePath)} missing Chat prepare-origin override`);
  }
  if (!source.includes("mode===`work`)return `tpp`")) {
    throw new Error(`${relPath(bundlePath)} missing Work origin force`);
  }
  if (!source.includes(HS_SUBMIT_REPLACEMENT)) {
    throw new Error(`${relPath(bundlePath)} missing home auto-submit effect`);
  }
  if (!source.includes("autoSubmit:CDRAutoSubmit=!1")) {
    throw new Error(`${relPath(bundlePath)} missing autoSubmit prop on home composer`);
  }
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
    source.includes(PAGE_MARKER) ||
    source.includes(PAGE_MARKER_V12) ||
    source.includes(PAGE_MARKER_V11) ||
    source.includes(PAGE_MARKER_V10) ||
    source.includes(PAGE_MARKER_V9) ||
    source.includes(PAGE_MARKER_V8) || (
      source.includes("function ROe(") &&
      source.includes("function mje(") &&
      source.includes("sidebarElectron.productMode.chatGptWork.plainText")
    ), `${platform} native app page`);
  const home = findOne(assets, (source) =>
    source.includes(HOME_MARKER) ||
    source.includes(HOME_MARKER_V12) ||
    source.includes(HOME_MARKER_V8) || (
      source.includes("function j(") &&
      source.includes("chatgptConversations.home.hero") &&
      (source.includes("conversationOrigin:`tpp`") || source.includes("conversationOrigin:CDRChatMode?null:`tpp`"))
    ), `${platform} Work home page`);
  const openThread = findOne(assets, (source) =>
    source.includes(OPEN_THREAD_MARKER) ||
    source.includes(OPEN_THREAD_MARKER_V12) ||
    source.includes(OPEN_THREAD_SOURCE) ||
    source.includes(OPEN_THREAD_V12), `${platform} Codex open-thread helper`);
  const chatOrigin = findOne(assets, (source) =>
    source.includes(ORIGIN_MARKER) ||
    source.includes(ORIGIN_MARKER_V12) ||
    source.includes(KM_ORIGIN_SOURCE) ||
    source.includes(KM_ORIGIN_V12), `${platform} ChatGPT completion origin`);
  const css = findOne(assets, (source, filePath) =>
    source.includes(CSS_MARKER) || (
      path.basename(filePath).startsWith("app-") &&
      source.includes("--color-token-main-surface-primary") &&
      source.includes(".electron-dark") &&
      source.includes("#root{height:100vh}")
    ), `${platform} global theme`);
  return { assets, page, home, openThread, chatOrigin, css };
}

function main() {
  const args = process.argv.slice(2);
  const requested = args.find((arg) => ["mac-x64", "mac-arm64", "win", "unix"].includes(arg));
  const platform = requested ?? SUPPORTED_PLATFORM;
  const checkOnly = args.includes("--check");
  const targets = locateTargets(platform);
  const nextPage = patchPage(targets.page.source, targets.page.path);
  const nextHome = patchWorkHome(targets.home.source, targets.home.path);
  const nextOpenThread = patchOpenThread(targets.openThread.source, targets.openThread.path);
  const nextChatOrigin = patchChatOrigin(targets.chatOrigin.source, targets.chatOrigin.path);
  const nextCss = patchCss(targets.css.source, targets.css.path);
  for (const target of [targets.page, targets.home, targets.openThread, targets.chatOrigin, targets.css]) {
    console.log(`  [${platform}] ${relPath(target.path)}`);
  }
  const anyChanged =
    nextPage.changed ||
    nextHome.changed ||
    nextOpenThread.changed ||
    nextChatOrigin.changed ||
    nextCss.changed;
  if (!anyChanged) {
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
    { path: targets.openThread.path, previous: targets.openThread.source, next: nextOpenThread.source, verify: verifyOpenThread },
    { path: targets.chatOrigin.path, previous: targets.chatOrigin.source, next: nextChatOrigin.source, verify: verifyChatOrigin },
    { path: targets.css.path, previous: targets.css.source, next: nextCss.source, verify: verifyCss },
  ];
  atomicReplaceEntries(entries, { transactionRoot: path.join(SRC_DIR, platform, "_asar") });
  console.log("    [ok] installed unified Chat/Work/Codex continuity atomically");
}

module.exports = {
  CHAT_HOME_ROUTE,
  CSS_MARKER,
  HOME_MARKER,
  OPEN_THREAD_MARKER,
  ORIGIN_MARKER,
  PAGE_MARKER,
  atomicReplaceEntries,
  countOccurrences,
  locateTargets,
  patchChatOrigin,
  patchCss,
  patchOpenThread,
  patchPage,
  patchWorkHome,
  recoverAtomicTransaction,
  replaceExactly,
  verifyChatOrigin,
  verifyCss,
  verifyOpenThread,
  verifyPage,
  verifyWorkHome,
};

if (require.main === module) main();



