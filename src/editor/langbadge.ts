/**
 * 代码块右上角的语言标签（Typora 风格）。
 * 围栏行永久折叠，改语言只能靠这个标签：可下拉选择，也可直接输入。
 */
import { WidgetType, type EditorView } from '@codemirror/view';

export const LANGS = [
  'text',
  'js',
  'ts',
  'jsx',
  'tsx',
  'vue',
  'py',
  'java',
  'kt',
  'c',
  'cpp',
  'cs',
  'go',
  'rust',
  'rb',
  'php',
  'swift',
  'sh',
  'bash',
  'powershell',
  'sql',
  'json',
  'yaml',
  'toml',
  'xml',
  'html',
  'css',
  'scss',
  'md',
  'diff',
  'mermaid',
];

let currentMenu: HTMLElement | null = null;
let detachMenu: (() => void) | null = null;

function closeMenu() {
  detachMenu?.();
  detachMenu = null;
  currentMenu?.remove();
  currentMenu = null;
}

export class LangBadgeWidget extends WidgetType {
  constructor(
    readonly view: EditorView,
    readonly lang: string,
    readonly infoFrom: number,
    readonly infoTo: number,
  ) {
    super();
  }

  eq(other: LangBadgeWidget) {
    return (
      other.lang === this.lang && other.infoFrom === this.infoFrom && other.infoTo === this.infoTo
    );
  }

  toDOM() {
    const badge = document.createElement('span');
    badge.className = 'cm-lang-badge';
    badge.textContent = this.lang || 'text';
    badge.title = '点击选择或输入代码语言';
    badge.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openMenu(badge);
    });
    return badge;
  }

  ignoreEvent() {
    return true;
  }

  private apply(value: string) {
    const { infoFrom, infoTo } = this;
    this.view.dispatch({
      changes:
        infoTo > infoFrom
          ? { from: infoFrom, to: infoTo, insert: value }
          : { from: infoFrom, insert: value },
    });
    this.view.focus();
  }

  private openMenu(anchor: HTMLElement) {
    const wasOpen = currentMenu !== null;
    closeMenu();
    if (wasOpen) return; // 再点一次收起

    const menu = document.createElement('div');
    menu.className = 'cm-lang-menu';

    const search = document.createElement('input');
    search.className = 'cm-lang-search';
    search.type = 'text';
    search.placeholder = '输入语言后回车，或点选下方';
    search.value = this.lang === 'text' ? '' : this.lang;

    const grid = document.createElement('div');
    grid.className = 'cm-lang-grid';

    const items: HTMLButtonElement[] = [];
    for (const lang of LANGS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'cm-lang-item' + (lang === (this.lang || 'text') ? ' active' : '');
      item.textContent = lang;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        this.apply(lang === 'text' ? '' : lang);
      });
      items.push(item);
      grid.appendChild(item);
    }

    const filter = () => {
      const q = search.value.trim().toLowerCase();
      for (const item of items) {
        item.hidden = q !== '' && !item.textContent!.toLowerCase().includes(q);
      }
    };
    search.addEventListener('input', filter);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = search.value.trim();
        closeMenu();
        this.apply(value.toLowerCase() === 'text' ? '' : value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
      }
    });

    menu.appendChild(search);
    menu.appendChild(grid);
    document.body.appendChild(menu);
    currentMenu = menu;

    const rect = anchor.getBoundingClientRect();
    const mrect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - mrect.width, window.innerWidth - mrect.width - 8));
    const top = Math.min(rect.bottom + 6, window.innerHeight - mrect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(8, top)}px`;

    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && menu.contains(e.target)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', onDown, true);
    detachMenu = () => {
      document.removeEventListener('mousedown', onDown, true);
    };

    search.focus();
    search.select();
  }
}
