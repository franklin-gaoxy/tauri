import type { FileNode } from '../lib/ipc';
import type { Heading } from '../editor/outline';

const CARET =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FILE_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4.2 2.2h5l2.6 2.6v9H4.2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 2.4v2.6h2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const FOLDER_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.8 3.8h4l1.2 1.6h7.2v7H1.8z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const SPACER = '<span class="tree-spacer"></span>';

export interface SidebarHandle {
  setTree: (nodes: FileNode[] | null, rootDir: string | null) => void;
  setOutline: (headings: Heading[]) => void;
  setActiveFile: (path: string | null) => void;
  setActiveHeading: (line: number) => void;
  showTab: (name: 'files' | 'outline') => void;
  /** 当前显示的是文件树还是大纲，菜单勾选状态要用 */
  currentTab: () => 'files' | 'outline';
  /** 展开到指定目录，新建文件后用来把父级撑开 */
  expandPath: (dir: string) => void;
}

/** 路径统一成正斜杠后做键，避免 Windows 反斜杠/正斜杠混用导致展开状态失效 */
const pathKey = (p: string) => p.replace(/\\/g, '/');

const dirOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));

export function createSidebar(
  root: HTMLElement,
  opts: {
    onOpenFile: (path: string) => void;
    onJumpHeading: (from: number) => void;
    onCreateFile: (dir: string) => void;
  },
): SidebarHandle {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.side-tab'));
  const filesPane = root.querySelector<HTMLElement>('[data-pane="files"]')!;
  const outlinePane = root.querySelector<HTMLElement>('[data-pane="outline"]')!;
  const searchInput = root.querySelector<HTMLInputElement>('#side-search')!;
  const expanded = new Set<string>();
  let activeFile: string | null = null;
  let headings: Heading[] = [];
  let rootDirPath: string | null = null;
  let query = '';
  let currentTab: 'files' | 'outline' = 'files';

  const showTab = (name: 'files' | 'outline') => {
    currentTab = name;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    filesPane.hidden = name !== 'files';
    outlinePane.hidden = name !== 'outline';
    searchInput.placeholder = name === 'files' ? '搜索文件' : '搜索大纲';
    renderFiles();
    renderOutline();
  };
  tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab as 'files' | 'outline')));

  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    renderFiles();
    renderOutline();
  });

  function fileRow(node: FileNode, depth: number): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tree-row' + (node.path === activeFile ? ' active' : '');
    row.style.paddingLeft = `${8 + depth * 12}px`;
    row.dataset.path = node.path;
    row.dataset.dir = node.isDir ? '1' : '0';

    if (node.isDir) {
      row.classList.add('is-dir');
      const open = expanded.has(pathKey(node.path));
      row.classList.toggle('expanded', open);
      row.innerHTML = `<span class="caret">${CARET}</span><span class="tree-icon">${FOLDER_ICON}</span><span class="tree-label"></span>`;
      row.querySelector('.tree-label')!.textContent = node.name;
      row.addEventListener('click', () => {
        if (expanded.has(pathKey(node.path))) expanded.delete(pathKey(node.path));
        else expanded.add(pathKey(node.path));
        renderFiles();
      });
    } else {
      row.innerHTML = `${SPACER}<span class="tree-icon">${FILE_ICON}</span><span class="tree-label"></span>`;
      row.querySelector('.tree-label')!.textContent = node.name;
      row.title = node.path;
      row.addEventListener('click', () => opts.onOpenFile(node.path));
    }
    return row;
  }

  let tree: FileNode[] | null = null;

  /** 搜索时只保留命中的文件及其父级目录 */
  function filterTree(nodes: FileNode[], q: string): FileNode[] {
    const out: FileNode[] = [];
    for (const node of nodes) {
      if (node.isDir) {
        const children = filterTree(node.children ?? [], q);
        if (children.length > 0) out.push({ ...node, children });
      } else if (node.name.toLowerCase().includes(q)) {
        out.push(node);
      }
    }
    return out;
  }

  function appendNodes(container: HTMLElement, nodes: FileNode[], depth: number, expandAll = false) {
    for (const node of nodes) {
      container.appendChild(fileRow(node, depth));
      if (node.isDir && (expandAll || expanded.has(pathKey(node.path)))) {
        appendNodes(container, node.children ?? [], depth + 1, expandAll);
      }
    }
  }

  function renderFiles() {
    filesPane.textContent = '';
    if (!tree || tree.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pane-empty';
      empty.textContent = tree ? '这个目录里没有 Markdown 文件' : '还没有打开文件夹';
      filesPane.appendChild(empty);
      return;
    }
    const shown = query ? filterTree(tree, query) : tree;
    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pane-empty';
      empty.textContent = '没有匹配的文件';
      filesPane.appendChild(empty);
      return;
    }
    appendNodes(filesPane, shown, 0, query !== '');
  }

  function renderOutline() {
    outlinePane.textContent = '';
    if (currentTab !== 'outline') return;
    const shown = query ? headings.filter((h) => h.text.toLowerCase().includes(query)) : headings;
    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pane-empty';
      empty.textContent = query ? '没有匹配的标题' : '当前文档没有标题';
      outlinePane.appendChild(empty);
      return;
    }
    for (const h of shown) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `outline-row level-${h.level}`;
      item.dataset.line = String(h.line);
      item.style.paddingLeft = `${10 + (h.level - 1) * 14}px`;
      item.textContent = h.text;
      item.title = h.text;
      item.addEventListener('click', () => opts.onJumpHeading(h.from));
      outlinePane.appendChild(item);
    }
  }

  // ------------------------------------------------------------ 右键菜单
  let menu: HTMLElement | null = null;

  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };

  function openMenu(x: number, y: number, dir: string | null) {
    closeMenu();
    if (!dir) return;
    const el = document.createElement('div');
    el.className = 'ctx-menu';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ctx-item';
    item.textContent = '新建文件';
    item.addEventListener('click', () => {
      closeMenu();
      opts.onCreateFile(dir);
    });

    el.appendChild(item);
    document.body.appendChild(el);
    menu = el;

    // 贴边时翻转，避免菜单超出窗口
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - 4) el.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight - 4) el.style.top = `${window.innerHeight - rect.height - 8}px`;
  }

  filesPane.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = (e.target as HTMLElement).closest<HTMLElement>('.tree-row');
    let dir = rootDirPath;
    if (row?.dataset.path) {
      dir = row.dataset.dir === '1' ? row.dataset.path : dirOf(row.dataset.path);
    }
    openMenu(e.clientX, e.clientY, dir);
  });

  document.addEventListener('mousedown', (e) => {
    if (menu && !menu.contains(e.target as Node)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
  filesPane.addEventListener('scroll', closeMenu);

  return {
    setTree(nodes, rootDir) {
      tree = nodes;
      rootDirPath = rootDir;
      if (rootDir) expanded.add(pathKey(rootDir));
      renderFiles();
    },
    expandPath(dir) {
      if (!rootDirPath) return;
      const rootKey = pathKey(rootDirPath);
      expanded.add(rootKey);
      let acc = rootKey.replace(/\/$/, '');
      for (const part of pathKey(dir).slice(rootKey.length).split('/').filter(Boolean)) {
        acc += `/${part}`;
        expanded.add(acc);
      }
    },
    setOutline(next) {
      headings = next;
      renderOutline();
    },
    setActiveFile(path) {
      activeFile = path;
      renderFiles();
    },
    setActiveHeading(line) {
      const rows = Array.from(outlinePane.querySelectorAll<HTMLElement>('.outline-row'));
      // 命中行号小于等于光标的最后一个标题，即当前所处章节
      let hit = -1;
      rows.forEach((el, i) => {
        if (Number(el.dataset.line) <= line) hit = i;
      });
      rows.forEach((el, i) => el.classList.toggle('active', i === hit));
    },
    showTab,
    currentTab: () => currentTab,
  };
}
