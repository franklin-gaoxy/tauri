import 'katex/dist/katex.min.css';
import { EditorView } from '@codemirror/view';
import { redo, selectAll, undo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { createEditor } from './editor';
import { reconfigureCodeLanguages } from './editor/code-languages';
import { extractHeadings } from './editor/outline';
import {
  clearFormat,
  insertCodeBlock,
  insertDivider,
  insertImage,
  insertLink,
  insertMathBlock,
  insertTable,
  setHeading,
  stepHeading,
  toggleList,
  toggleQuote,
  toggleWrap,
} from './editor/format';
import {
  closeWindow,
  createFile,
  listTree,
  onFsChanged,
  pickFile,
  pickFolder,
  readFile,
  setWindowTitle,
  toggleFullscreen,
  watchFile,
  writeFile,
} from './lib/ipc';
import { createSidebar, type SidebarHandle } from './ui/sidebar';
import { initPreferences, type PreferencesHandle } from './ui/preferences';
import { createMenuBar } from './ui/menu';
import { askFileName, toast } from './ui/dialog';
import { applyAppearance, loadAppearance, saveAppearance } from './settings/appearance';
import { loadPrefs, savePrefs } from './settings/prefs';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const els = {
  editorHost: $('#editor'),
  welcome: $('#welcome'),
  dirtyDot: $('#dirty-dot'),
  sidebar: $('#sidebar'),
  prefs: $('#prefs'),
  wordCount: $('#word-count'),
  statusbar: $('#statusbar'),
  sourceBtn: $('#btn-source'),
};

const ROOT_KEY = 'md-editor.root';

let prefs = loadPrefs();
let appearance = loadAppearance();
let rootDir: string | null = prefs.startMode === 'restore' ? localStorage.getItem(ROOT_KEY) : null;
let currentFile: string | null = null;
let dirty = false;
let suppress = false;
let saveTimer = 0;
let outlineTimer = 0;
let lastWriteAt = 0;
let sidebar: SidebarHandle | null = null;
let preferences: PreferencesHandle | null = null;
let sourceMode = false;
let focusOn = false;
let statusbarOn = true;
let zoom = prefs.zoom;

function dirname(p: string) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : p;
}

function basename(p: string) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

function setTitle() {
  const name = currentFile ? basename(currentFile) : null;
  const title = name ? `${name} - Markdown` : 'Markdown';
  document.title = title;
  void setWindowTitle(title).catch(() => undefined);
  els.dirtyDot.hidden = !dirty;
}

function updateWordCount() {
  const text = editor.view.state.doc.toString();
  // 与 Typora 一致，按非空白字符数统计
  els.wordCount.textContent = `${text.replace(/\s/g, '').length} 字`;
}

function applyZoom() {
  document.documentElement.style.setProperty('--editor-zoom', String(zoom));
  // 用最新偏好做底，避免覆盖偏好设置里刚改的其它项
  savePrefs({ ...loadPrefs(), zoom });
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) editor.view.dispatch(editor.view.state.replaceSelection(text));
  } catch {
    toast('无法读取剪贴板，请使用 Ctrl+V');
  }
}

const editor = createEditor({
  parent: els.editorHost,
  getBaseDir: () => (currentFile ? dirname(currentFile) : rootDir),
  onChange: () => {
    if (suppress) return;
    dirty = true;
    setTitle();
    updateWordCount();
    window.clearTimeout(outlineTimer);
    outlineTimer = window.setTimeout(refreshOutline, 200);
    if (!loadPrefs().autoSave) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveNow(), 900);
  },
  onCursor: (line) => sidebar?.setActiveHeading(line),
  onSave: () => void saveNow(true),
});

editor.setSourceMode(!prefs.livePreview);
sourceMode = !prefs.livePreview;
editor.setTypewriter(prefs.typewriter);
applyZoom();

sidebar = createSidebar(els.sidebar, {
  onOpenFile: (path) => void openFile(path),
  onCreateFile: (dir) => void createNewFile(dir),
  onJumpHeading: (from) => {
    editor.view.dispatch({
      selection: { anchor: from },
      effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 60 }),
    });
    editor.focus();
  },
});

preferences = initPreferences(els.prefs, {
  onLivePreview: (on) => {
    sourceMode = !on;
    editor.setSourceMode(sourceMode);
    els.sourceBtn.classList.toggle('active', sourceMode);
  },
  onTypewriter: (on) => editor.setTypewriter(on),
  onCodeLanguages: () => reconfigureCodeLanguages(editor.view),
});

function refreshOutline() {
  sidebar?.setOutline(currentFile ? extractHeadings(editor.view.state) : []);
}

async function saveNow(force = false) {
  if (!currentFile || (!dirty && !force)) return;
  const path = currentFile;
  const content = editor.view.state.doc.toString();
  try {
    await writeFile(path, content);
    lastWriteAt = Date.now();
    if (path === currentFile) {
      dirty = false;
      setTitle();
    }
  } catch (err) {
    toast(`保存失败：${String(err)}`);
  }
}

async function openFile(path: string) {
  if (path === currentFile) return;
  await saveNow();
  let text = '';
  try {
    text = await readFile(path);
  } catch (err) {
    toast(`读取失败：${String(err)}`);
    return;
  }
  currentFile = path;
  dirty = false;
  suppress = true;
  editor.setDoc(text);
  suppress = false;
  els.welcome.hidden = true;
  setTitle();
  updateWordCount();
  sidebar?.setActiveFile(path);
  refreshOutline();
  sidebar?.setActiveHeading(1);
  void watchFile(path).catch(() => undefined);
  editor.focus();
}

async function createNewFile(dir: string) {
  const name = await askFileName(dir);
  if (!name) return;
  const fileName = /\.[^./\\]+$/.test(name) ? name : `${name}.md`;
  const path = `${dir.replace(/[\\/]$/, '')}/${fileName}`;
  try {
    await createFile(path);
    sidebar?.expandPath(dir);
    await refreshTree();
    await openFile(path);
  } catch (err) {
    toast(`新建失败：${String(err)}`);
  }
}

async function newFile() {
  if (!rootDir) {
    const dir = await pickFolder();
    if (!dir) return;
    rootDir = dir;
    if (loadPrefs().recordHistory) localStorage.setItem(ROOT_KEY, dir);
    await refreshTree();
  }
  if (rootDir) await createNewFile(rootDir);
}

async function refreshTree() {
  if (!rootDir) return;
  try {
    sidebar?.setTree(await listTree(rootDir), rootDir);
  } catch (err) {
    toast(`读取目录失败：${String(err)}`);
  }
}

/** 打开单个文件：把它所在目录作为当前目录，左侧树随之切换 */
async function openSingleFile() {
  const file = await pickFile();
  if (!file) return;
  const dir = dirname(file);
  if (dir !== rootDir) {
    rootDir = dir;
    if (loadPrefs().recordHistory) localStorage.setItem(ROOT_KEY, dir);
    await refreshTree();
  }
  await openFile(file);
}

async function openFolder() {
  const dir = await pickFolder();
  if (!dir) return;
  rootDir = dir;
  if (loadPrefs().recordHistory) localStorage.setItem(ROOT_KEY, dir);
  await refreshTree();
}

function toggleSidebar() {
  const next = els.sidebar.hidden;
  els.sidebar.hidden = !next;
}

function toggleSourceMode() {
  sourceMode = !sourceMode;
  editor.setSourceMode(sourceMode);
  els.sourceBtn.classList.toggle('active', sourceMode);
}

function toggleFocusMode() {
  focusOn = !focusOn;
  editor.setFocusMode(focusOn);
}

function toggleTypewriter() {
  const next = { ...loadPrefs(), typewriter: !loadPrefs().typewriter };
  savePrefs(next);
  editor.setTypewriter(next.typewriter);
}

function setZoom(next: number) {
  zoom = Math.min(2, Math.max(0.7, Number(next.toFixed(2))));
  applyZoom();
}

function setTheme(theme: 'light' | 'dark') {
  appearance = { ...appearance, theme };
  applyAppearance(appearance);
  saveAppearance(appearance);
}

$('#btn-open-2').addEventListener('click', () => void openFolder());
els.sourceBtn.addEventListener('click', toggleSourceMode);
els.sourceBtn.classList.toggle('active', sourceMode);

// ------------------------------------------------------------ 菜单栏
createMenuBar($('#menubar'), [
  {
    label: '文件(F)',
    items: [
      { label: '新建', hint: 'Ctrl+N', run: () => void newFile() },
      { separator: true },
      { label: '打开...', hint: 'Ctrl+O', run: () => void openSingleFile() },
      { label: '打开文件夹...', hint: 'Ctrl+Shift+O', run: () => void openFolder() },
      { separator: true },
      { label: '保存', hint: 'Ctrl+S', run: () => void saveNow(true) },
      { separator: true },
      { label: '偏好设置...', hint: 'Ctrl+,', run: () => preferences?.open() },
      { separator: true },
      { label: '关闭', hint: 'Ctrl+W', run: () => void closeWindow() },
    ],
  },
  {
    label: '编辑(E)',
    items: [
      { label: '撤销', hint: 'Ctrl+Z', run: () => undo(editor.view) },
      { label: '重做', hint: 'Ctrl+Y', run: () => redo(editor.view) },
      { separator: true },
      { label: '剪切', hint: 'Ctrl+X', run: () => document.execCommand('cut') },
      { label: '复制', hint: 'Ctrl+C', run: () => document.execCommand('copy') },
      { label: '粘贴', hint: 'Ctrl+V', run: () => void pasteFromClipboard() },
      { separator: true },
      { label: '全选', hint: 'Ctrl+A', run: () => selectAll(editor.view) },
      { separator: true },
      { label: '查找和替换', hint: 'Ctrl+F', run: () => openSearchPanel(editor.view) },
    ],
  },
  {
    label: '段落(P)',
    items: [
      ...[1, 2, 3, 4, 5, 6].map((level) => ({
        label: `${'一二三四五六'[level - 1]}级标题`,
        hint: `Ctrl+${level}`,
        run: () => setHeading(editor.view, level),
      })),
      { separator: true },
      { label: '段落', hint: 'Ctrl+0', run: () => setHeading(editor.view, 0) },
      { separator: true },
      { label: '提升标题级别', hint: 'Ctrl+=', run: () => stepHeading(editor.view, -1) },
      { label: '降低标题级别', hint: 'Ctrl+-', run: () => stepHeading(editor.view, 1) },
      { separator: true },
      { label: '表格', run: () => insertTable(editor.view) },
      { label: '公式块', run: () => insertMathBlock(editor.view) },
      { label: '代码块', hint: 'Ctrl+Shift+K', run: () => insertCodeBlock(editor.view) },
      { separator: true },
      { label: '引用', hint: 'Ctrl+Shift+Q', run: () => toggleQuote(editor.view) },
      { separator: true },
      { label: '有序列表', hint: 'Ctrl+Shift+[', run: () => toggleList(editor.view, 'ol') },
      { label: '无序列表', hint: 'Ctrl+Shift+]', run: () => toggleList(editor.view, 'ul') },
      { label: '任务列表', hint: 'Ctrl+Shift+X', run: () => toggleList(editor.view, 'task') },
      { separator: true },
      { label: '水平分割线', run: () => insertDivider(editor.view) },
    ],
  },
  {
    label: '格式(O)',
    items: [
      { label: '加粗', hint: 'Ctrl+B', run: () => toggleWrap(editor.view, '**', '**', '粗体') },
      { label: '斜体', hint: 'Ctrl+I', run: () => toggleWrap(editor.view, '*', '*', '斜体') },
      { label: '下划线', hint: 'Ctrl+U', run: () => toggleWrap(editor.view, '<u>', '</u>', '下划线') },
      { label: '代码', hint: 'Ctrl+Shift+`', run: () => toggleWrap(editor.view, '`', '`', 'code') },
      { label: '删除线', run: () => toggleWrap(editor.view, '~~', '~~', '删除线') },
      { label: '注释', run: () => toggleWrap(editor.view, '<!-- ', ' -->', '注释') },
      { separator: true },
      { label: '超链接', hint: 'Ctrl+K', run: () => insertLink(editor.view) },
      { label: '图像', run: () => insertImage(editor.view) },
      { separator: true },
      { label: '清除样式', hint: 'Ctrl+\\', run: () => clearFormat(editor.view) },
    ],
  },
  {
    label: '视图(V)',
    items: [
      {
        label: '显示 / 隐藏侧边栏',
        hint: 'Ctrl+Shift+L',
        run: toggleSidebar,
      },
      {
        label: '大纲',
        hint: 'Ctrl+Shift+1',
        checked: () => sidebar?.currentTab() === 'outline',
        run: () => sidebar?.showTab('outline'),
      },
      {
        label: '文件树',
        hint: 'Ctrl+Shift+3',
        checked: () => sidebar?.currentTab() === 'files',
        run: () => sidebar?.showTab('files'),
      },
      {
        label: '搜索',
        hint: 'Ctrl+Shift+F',
        run: () => {
          els.sidebar.hidden = false;
          const input = document.querySelector<HTMLInputElement>('#side-search');
          input?.focus();
        },
      },
      { separator: true },
      {
        label: '源码模式',
        hint: 'Ctrl+/',
        checked: () => sourceMode,
        run: toggleSourceMode,
      },
      {
        label: '专注模式',
        hint: 'F8',
        checked: () => focusOn,
        run: toggleFocusMode,
      },
      {
        label: '打字机模式',
        hint: 'F9',
        checked: () => loadPrefs().typewriter,
        run: toggleTypewriter,
      },
      { separator: true },
      {
        label: '显示状态栏',
        checked: () => statusbarOn,
        run: () => {
          statusbarOn = !statusbarOn;
          els.statusbar.hidden = !statusbarOn;
        },
      },
      { separator: true },
      { label: '切换全屏', hint: 'F11', run: () => void toggleFullscreen() },
      { separator: true },
      { label: '实际大小', hint: 'Ctrl+Shift+9', run: () => setZoom(1) },
      { label: '放大', hint: 'Ctrl+Shift+=', run: () => setZoom(zoom + 0.1) },
      { label: '缩小', hint: 'Ctrl+Shift+-', run: () => setZoom(zoom - 0.1) },
    ],
  },
  {
    label: '主题(T)',
    items: [
      {
        label: '浅色',
        checked: () => appearance.theme === 'light',
        run: () => setTheme('light'),
      },
      {
        label: '深色',
        checked: () => appearance.theme === 'dark',
        run: () => setTheme('dark'),
      },
    ],
  },
  {
    label: '帮助(H)',
    items: [
      { label: '快捷键', run: () => toast('Ctrl+B 粗体 · Ctrl+I 斜体 · Ctrl+K 链接 · Ctrl+F 查找 · F9 打字机') },
      { label: '关于', run: () => toast('Markdown 编辑器 0.1.0 · Tauri 2 + CodeMirror 6') },
    ],
  },
]);

// ------------------------------------------------------------ 全局快捷键
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === ',') {
    e.preventDefault();
    preferences?.open();
    return;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    void newFile();
    return;
  }
  if (mod && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    if (e.shiftKey) void openFolder();
    else void openSingleFile();
    return;
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    toggleSidebar();
    return;
  }
  if (mod && e.key === '/') {
    e.preventDefault();
    toggleSourceMode();
    return;
  }
  if (e.key === 'F8') {
    e.preventDefault();
    toggleFocusMode();
    return;
  }
  if (e.key === 'F9') {
    e.preventDefault();
    toggleTypewriter();
  }
});

// 外部改动同步：自己刚写完的 1.5s 内忽略，避免光标跳动
void onFsChanged(async (changed) => {
  if (changed !== currentFile) return;
  if (Date.now() - lastWriteAt < 1500) return;
  if (dirty) return;
  try {
    const text = await readFile(changed);
    if (text === editor.view.state.doc.toString()) return;
    const pos = editor.view.state.selection.main.head;
    suppress = true;
    editor.setDoc(text);
    suppress = false;
    editor.view.dispatch({ selection: { anchor: Math.min(pos, editor.view.state.doc.length) } });
    refreshOutline();
    updateWordCount();
  } catch {
    /* 文件可能刚被删除，忽略 */
  }
});

setTitle();
updateWordCount();
if (rootDir) void refreshTree();

// 仅开发模式：暴露调试句柄，便于用 DevTools 协议驱动验证
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__md = {
    editor,
    openFile,
    refreshTree,
    preferences,
  };
}
