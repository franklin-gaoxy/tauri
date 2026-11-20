/**
 * 所见即所得核心：基于语法树把 Markdown 源码“就地渲染”。
 * 光标所在行显示原始标记（方便改语法），其余行只显示渲染结果。
 */
import { syntaxTree } from '@codemirror/language';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { StateField, type EditorState, type Range } from '@codemirror/state';
import katex from 'katex';
import { readImage } from '../lib/ipc';
import { LangBadgeWidget } from './langbadge';

const HIDE = Decoration.replace({});

interface MdNode {
  name: string;
  from: number;
  to: number;
  firstChild: MdNode | null;
  lastChild: MdNode | null;
  nextSibling: MdNode | null;
  parent: MdNode | null;
}

const asNode = (n: unknown) => n as MdNode;

const EMPHASIS: Record<string, { mark: string; cls: string }> = {
  Emphasis: { mark: 'EmphasisMark', cls: 'cm-em' },
  StrongEmphasis: { mark: 'EmphasisMark', cls: 'cm-strong' },
  Strikethrough: { mark: 'StrikethroughMark', cls: 'cm-strike' },
};

/** Lezer 里加粗与斜体都用 EmphasisMark，兼容两种命名 */
const isEmphasisMark = (node: MdNode | null, mark: string) =>
  !!node && (node.name === mark || node.name === 'EmphasisMark');

// ---------------------------------------------------------------- 图片

const imageCache = new Map<string, string>();

function isRemote(src: string) {
  return /^(https?:)?\/\//.test(src) || src.startsWith('data:') || src.startsWith('blob:');
}

function joinPath(baseDir: string | null, src: string): string | null {
  const cleaned = decodeURI(src.split('#')[0].split('?')[0]);
  if (/^[a-zA-Z]:[\\/]/.test(cleaned)) return cleaned;
  if (cleaned.startsWith('file://')) return decodeURI(cleaned.slice(7));
  if (!baseDir || cleaned.startsWith('/')) return null;
  const parts = (baseDir.replace(/\\/g, '/') + '/' + cleaned).split('/');
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else if (p !== '.' && p !== '') stack.push(p);
  }
  const joined = stack.join('/');
  return /^[a-zA-Z]:/.test(joined) ? joined : '/' + joined;
}

async function localImageUrl(src: string, baseDir: string | null): Promise<string | null> {
  const abs = joinPath(baseDir, src);
  if (!abs) return null;
  const hit = imageCache.get(abs);
  if (hit) return hit;
  try {
    const bytes = await readImage(abs);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
    imageCache.set(abs, url);
    return url;
  } catch {
    return null;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly baseDir: string | null,
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return o.src === this.src && o.alt === this.alt && o.baseDir === this.baseDir;
  }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-image';
    wrap.title = this.src;
    const img = document.createElement('img');
    img.alt = this.alt;
    img.loading = 'lazy';
    wrap.appendChild(img);

    if (isRemote(this.src)) {
      img.src = this.src;
    } else {
      void localImageUrl(this.src, this.baseDir).then((url) => {
        if (url) img.src = url;
        else wrap.classList.add('cm-image-missing');
      });
    }
    return wrap;
  }
}

// ---------------------------------------------------------------- 其它内联组件

class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-hr';
    return el;
  }
}

class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
    readonly view: EditorView,
  ) {
    super();
  }
  eq(o: TaskWidget) {
    return o.checked === this.checked && o.from === this.from;
  }
  toDOM() {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-task';
    box.checked = this.checked;
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' },
      });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display;
  }
  toDOM() {
    const el = document.createElement(this.display ? 'div' : 'span');
    el.className = this.display ? 'cm-math-block' : 'cm-math';
    try {
      katex.render(this.tex, el, { displayMode: this.display, throwOnError: false });
    } catch {
      el.textContent = this.tex;
      el.classList.add('cm-math-error');
    }
    return el;
  }
}

let mermaidReady: Promise<typeof import('mermaid').default> | null = null;

async function renderMermaid(el: HTMLElement, code: string) {
  try {
    if (!mermaidReady) mermaidReady = import('mermaid').then((m) => m.default);
    const mermaid = await mermaidReady;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
    const id = 'mmd-' + Math.random().toString(36).slice(2);
    const { svg } = await mermaid.render(id, code);
    el.innerHTML = svg;
    el.classList.add('cm-mermaid-done');
  } catch (err) {
    el.textContent = '图表渲染失败：' + String(err);
    el.classList.add('cm-mermaid-error');
  }
}

class MermaidWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }
  eq(o: MermaidWidget) {
    return o.code === this.code;
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-mermaid';
    el.textContent = '正在渲染图表…';
    void renderMermaid(el, this.code);
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

// ---------------------------------------------------------------- 表格

const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s*\|[\s:|-]+\|\s*$/;

const splitCells = (text: string) =>
  text
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 单元格内只保留最常用的行内语法 */
function cellHtml(text: string) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '<span class="cm-img-label">$1</span>');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '<a class="cm-link">$1</a>');
  return s;
}

interface TableBlock {
  from: number;
  to: number;
  header: string[];
  aligns: Array<'left' | 'center' | 'right'>;
  rows: string[][];
  source: string;
}

/** 块级装饰由 StateField 计算，拿不到 view，这里记住当前编辑器实例 */
let activeView: EditorView | null = null;

class TableWidget extends WidgetType {
  constructor(
    readonly key: string,
    readonly block: TableBlock,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return other.key === this.key;
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-table-wrap';
    const table = document.createElement('table');
    table.className = 'cm-table';

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    this.block.header.forEach((cell, i) => {
      const th = document.createElement('th');
      th.innerHTML = cellHtml(cell);
      th.style.textAlign = this.block.aligns[i] ?? 'left';
      headRow.appendChild(th);
    });
    head.appendChild(headRow);

    const body = document.createElement('tbody');
    for (const row of this.block.rows) {
      const tr = document.createElement('tr');
      for (let i = 0; i < this.block.header.length; i++) {
        const td = document.createElement('td');
        td.innerHTML = cellHtml(row[i] ?? '');
        td.style.textAlign = this.block.aligns[i] ?? 'left';
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }

    table.append(head, body);
    wrap.appendChild(table);
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const view = activeView;
      if (!view) return;
      view.dispatch({ selection: { anchor: this.block.from } });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

// ---------------------------------------------------------------- 块级元素

type BlockKind = 'table' | 'mermaid' | 'math';

interface BlockSpan {
  kind: BlockKind;
  from: number;
  to: number;
  key: string;
  table?: TableBlock;
  code?: string;
  tex?: string;
}

/** 扫描整篇文档里的块级元素：表格、mermaid 围栏、$$ 公式块 */
function collectBlocks(state: EditorState): BlockSpan[] {
  const out: BlockSpan[] = [];
  const doc = state.doc;
  let fence: { info: string; startLine: number } | null = null;

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const text = line.text;
    const fenceMark = /^\s*(```+|~~~+)\s*(.*)$/.exec(text);

    if (fence) {
      if (fenceMark) {
        if (fence.info === 'mermaid') {
          const from = doc.line(fence.startLine).from;
          const body: string[] = [];
          for (let k = fence.startLine + 1; k < n; k++) body.push(doc.line(k).text);
          out.push({
            kind: 'mermaid',
            from,
            to: line.to,
            key: `mermaid:${from}:${body.join('\n')}`,
            code: body.join('\n'),
          });
        }
        fence = null;
      }
      continue;
    }

    if (fenceMark) {
      fence = { info: fenceMark[2].trim().toLowerCase(), startLine: n };
      continue;
    }

    // $$ 公式块
    if (/^\s*\$\$/.test(text)) {
      const single = /^\s*\$\$[\s\S]*\$\$\s*$/.test(text);
      let end = n;
      if (!single) {
        end = doc.lines;
        for (let k = n + 1; k <= doc.lines; k++) {
          if (doc.line(k).text.includes('$$')) {
            end = k;
            break;
          }
        }
        if (end === n) continue;
      }
      const raw = single ? text : doc.sliceString(line.from, doc.line(end).to);
      const tex = raw.replace(/^\s*\$\$/, '').replace(/\$\$\s*$/, '').trim();
      out.push({
        kind: 'math',
        from: line.from,
        to: doc.line(end).to,
        key: `math:${line.from}:${tex}`,
        tex,
      });
      n = end;
      continue;
    }

    // 表格：表头 + 分隔行 + 若干数据行
    if (TABLE_LINE.test(text) && n < doc.lines && TABLE_DIVIDER.test(doc.line(n + 1).text)) {
      let end = n + 1;
      while (end + 1 <= doc.lines && TABLE_LINE.test(doc.line(end + 1).text)) end += 1;
      const lines: string[] = [];
      for (let k = n; k <= end; k++) lines.push(doc.line(k).text);
      const aligns = splitCells(lines[1]).map((cell): 'left' | 'center' | 'right' => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        return left && right ? 'center' : right ? 'right' : 'left';
      });
      out.push({
        kind: 'table',
        from: line.from,
        to: doc.line(end).to,
        key: `table:${lines.join('\n')}`,
        table: {
          from: line.from,
          to: doc.line(end).to,
          header: splitCells(lines[0]),
          aligns,
          rows: lines.slice(2).map(splitCells),
          source: lines.join('\n'),
        },
      });
      n = end;
    }
  }

  return out;
}

/** 光标不在块内时才整体替换，进入块内就显示源码 */
function blockDecorations(state: EditorState): DecorationSet {
  const sel = state.selection.main;
  const head = sel.empty ? sel.head : -1;
  const out: Range<Decoration>[] = [];

  for (const span of collectBlocks(state)) {
    if (head >= span.from && head <= span.to) continue;
    let widget: WidgetType;
    if (span.kind === 'table' && span.table) widget = new TableWidget(span.key, span.table);
    else if (span.kind === 'mermaid') widget = new MermaidWidget(span.code ?? '');
    else widget = new MathWidget(span.tex ?? '', true);
    out.push(Decoration.replace({ widget, block: true }).range(span.from, span.to));
  }

  return Decoration.set(out, true);
}

const blockField = StateField.define<DecorationSet>({
  create: (state) => blockDecorations(state),
  update: (value, tr) => (tr.docChanged || tr.selection ? blockDecorations(tr.state) : value),
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

// ---------------------------------------------------------------- 构建装饰

function inCode(state: EditorState, pos: number) {
  let n: MdNode | null = asNode(syntaxTree(state).resolveInner(Math.min(pos + 1, state.doc.length), 1));
  while (n) {
    if (
      n.name === 'InlineCode' ||
      n.name === 'FencedCode' ||
      n.name === 'CodeBlock' ||
      n.name === 'CodeText' ||
      // 已被整体替换的区域里不能再叠加公式装饰，否则会报装饰重叠
      n.name === 'Image' ||
      n.name === 'URL'
    ) {
      return true;
    }
    n = n.parent;
  }
  return false;
}

function eachLine(state: EditorState, from: number, to: number, cb: (lineFrom: number, isLast: boolean) => void) {
  let pos = from;
  for (;;) {
    const line = state.doc.lineAt(pos);
    // 围栏代码块节点的 to 常常包含最后一个换行，会多圈进下面那行空行，
    // 那行其实是块外的新行，不能涂成代码块背景
    if (line.from > from && line.from >= to) break;
    const last = line.to >= to;
    cb(line.from, last);
    if (last) break;
    pos = line.to + 1;
  }
}

function buildDecorations(view: EditorView, baseDir: string | null): DecorationSet {
  const state = view.state;
  const doc = state.doc;
  const out: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  // 只有“单个空光标”时才把源码露出来；一旦有选区就保持渲染结果，
  // 否则框选多行时行高/字号会跟着变，视觉上跳来跳去
  const caretOnly = state.selection.ranges.length === 1 && state.selection.main.empty;
  const head = state.selection.main.head;

  /** 光标是否恰好落在 pos 所在行 */
  const active = (pos: number) => {
    if (!caretOnly) return false;
    const line = doc.lineAt(pos);
    return head >= line.from && head <= line.to;
  };
  const hide = (from: number, to: number) => {
    if (to > from) out.push(HIDE.range(from, to));
  };
  const mark = (from: number, to: number, cls: string) => {
    if (to > from) out.push(Decoration.mark({ class: cls }).range(from, to));
  };

  // 块级元素由 StateField 整块渲染，这里只处理块外的行内语法
  const blocks = collectBlocks(state);
  const replaced = (pos: number) =>
    blocks.some((b) => pos >= b.from && pos <= b.to && !(caretOnly && head >= b.from && head <= b.to));

  for (const visible of view.visibleRanges) {
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter: (ref) => {
        const name = ref.name;
        const node = asNode(ref.node);

        if (replaced(ref.from)) return;

        // 标题
        const heading = /^(ATXHeading|SetextHeading)([1-6])$/.exec(name);
        if (heading) {
          out.push(
            Decoration.line({ class: `cm-heading cm-h${heading[2]}` }).range(doc.lineAt(ref.from).from),
          );
          if (name.startsWith('ATX')) {
            for (let c = node.firstChild; c; c = c.nextSibling) {
              if (c.name === 'HeaderMark' && !active(c.from)) hide(c.from, c.to);
            }
          }
          return;
        }

        // 强调 / 加粗 / 删除线
        const em = EMPHASIS[name];
        if (em) {
          const first = node.firstChild;
          const last = node.lastChild;
          const innerFrom = isEmphasisMark(first, em.mark) ? first!.to : ref.from;
          const innerTo = isEmphasisMark(last, em.mark) ? last!.from : ref.to;
          mark(innerFrom, innerTo, em.cls);
          if (!active(ref.from)) {
            if (isEmphasisMark(first, em.mark)) hide(first!.from, first!.to);
            if (isEmphasisMark(last, em.mark)) hide(last!.from, last!.to);
          }
          return;
        }

        // 行内代码
        if (name === 'InlineCode') {
          const first = node.firstChild;
          const last = node.lastChild;
          const innerFrom = first && first.name === 'CodeMark' ? first.to : ref.from;
          const innerTo = last && last.name === 'CodeMark' ? last.from : ref.to;
          mark(innerFrom, innerTo, 'cm-inline-code');
          if (!active(ref.from)) {
            if (first && first.name === 'CodeMark') hide(first.from, first.to);
            if (last && last.name === 'CodeMark') hide(last.from, last.to);
          }
          return;
        }

        // 链接 / 图片
        if (name === 'Link' || name === 'Image') {
          const marks: MdNode[] = [];
          const urls: MdNode[] = [];
          const text: MdNode[] = [];
          for (let c = node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'LinkMark') marks.push(c);
            else if (c.name === 'URL') urls.push(c);
            else text.push(c);
          }
          const url = urls.length ? doc.sliceString(urls[0].from, urls[0].to) : '';
          const textFrom = text.length ? text[0].from : ref.from;
          const textTo = text.length ? text[text.length - 1].to : ref.to;
          const label = doc.sliceString(textFrom, textTo) || url;

          if (name === 'Image') {
            if (!active(ref.from) && ref.from <= doc.lineAt(ref.from).to) {
              out.push(
                Decoration.replace({
                  widget: new ImageWidget(url, label, baseDir),
                }).range(ref.from, ref.to),
              );
            }
          } else {
            mark(textFrom, textTo, 'cm-link');
            if (!active(ref.from)) {
              if (marks[0]) hide(marks[0].from, marks[0].to);
              if (marks[1]) hide(marks[1].from, ref.to);
              else if (urls[0]) hide(urls[0].from, ref.to);
            }
          }
          return;
        }

        // 围栏代码块 / mermaid
        if (name === 'FencedCode' || name === 'CodeBlock') {
          const marks: MdNode[] = [];
          let infoText = '';
          let infoNode: MdNode | null = null;
          for (let c = node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'CodeInfo') {
              infoNode = c;
              infoText = doc.sliceString(c.from, c.to).trim().toLowerCase();
            } else if (c.name === 'CodeMark') marks.push(c);
          }
          // 代码体行（围栏之间），只给代码体加背景和圆角
          const openLine = marks.length > 0 ? doc.lineAt(marks[0].from) : null;
          const closeLine = marks.length > 1 ? doc.lineAt(marks[marks.length - 1].from) : null;
          const firstBody = openLine ? openLine.number + 1 : doc.lineAt(ref.from).number;
          const lastBody = closeLine ? closeLine.number - 1 : doc.lines;

          if (lastBody >= firstBody) {
            for (let n = firstBody; n <= lastBody; n++) {
              const ln = doc.line(n);
              const cls = `cm-codeblock${n === firstBody ? ' cm-cb-first' : ''}${
                n === lastBody ? ' cm-cb-last' : ''
              }`;
              out.push(Decoration.line({ class: cls }).range(ln.from));
            }
          }

          // 围栏行折叠：光标不在该行时整行隐藏，不再占一行
          for (const fenceLine of [openLine, closeLine]) {
            if (!fenceLine || lastBody < firstBody) continue;
            // 永久折叠：改语言走右上角标签，不再因为光标落到该行而露出 ```
            out.push(Decoration.line({ class: 'cm-fence-hidden' }).range(fenceLine.from));
            hide(fenceLine.from, fenceLine.to);
          }

          // 右上角语言标签：围栏收起后仍能改语言
          if (name === 'FencedCode' && lastBody >= firstBody && marks.length > 0) {
            const infoFrom = infoNode ? infoNode.from : marks[0].to;
            const infoTo = infoNode ? infoNode.to : infoFrom;
            out.push(
              Decoration.widget({
                widget: new LangBadgeWidget(view, infoText, infoFrom, infoTo),
                side: 1,
              }).range(doc.line(firstBody).to),
            );
          }
          return;
        }

        // 引用
        if (name === 'Blockquote') {
          eachLine(state, ref.from, ref.to, (lineFrom) => {
            out.push(Decoration.line({ class: 'cm-quote' }).range(lineFrom));
          });
          return;
        }
        if (name === 'QuoteMark' && !active(ref.from)) {
          hide(ref.from, ref.to);
          return;
        }

        // 分隔线
        if (name === 'HorizontalRule') {
          const line = doc.lineAt(ref.from);
          out.push(Decoration.replace({ widget: new HrWidget() }).range(line.from, line.to));
          return;
        }

        // 任务列表勾选框
        if (name === 'TaskMarker') {
          const checked = /\[[xX]\]/.test(doc.sliceString(ref.from, ref.to));
          out.push(
            Decoration.replace({
              widget: new TaskWidget(checked, ref.from, ref.to, view),
            }).range(ref.from, ref.to),
          );
          return;
        }

        // 列表符号
        if (name === 'ListMark') {
          mark(ref.from, ref.to, 'cm-listmark');
          return;
        }

      },
    });

    // 光标进入表格 / 公式块时显示源码：表格行用等宽样式
    for (const block of blocks) {
      if (block.kind !== 'table') continue;
      if (!caretOnly || head < block.from || head > block.to) continue;
      eachLine(state, block.from, block.to, (lineFrom) => {
        out.push(Decoration.line({ class: 'cm-table-line' }).range(lineFrom));
      });
    }

    // 行内公式：$...$（跨行公式块由块级 StateField 处理）
    const text = doc.sliceString(visible.from, visible.to);
    const inlineRe = /(?<![$\\])\$([^$\n]+?)\$(?!\$)/g;
    let m: RegExpExecArray | null;
    while ((m = inlineRe.exec(text))) {
      const from = visible.from + m.index;
      const to = from + m[0].length;
      if (inCode(state, from) || active(from) || replaced(from)) continue;
      out.push(Decoration.replace({ widget: new MathWidget(m[1].trim(), false) }).range(from, to));
    }
  }

  return Decoration.set(out, true);
}

// ---------------------------------------------------------------- 插件入口

/** 渲染出错时退回纯文本显示，不让整块编辑器挂掉 */
function safeBuild(view: EditorView, baseDir: string | null): DecorationSet {
  try {
    return buildDecorations(view, baseDir);
  } catch (err) {
    console.warn('实时渲染失败，已退回源码显示', err);
    return Decoration.none;
  }
}

export function livePreview(getBaseDir: () => string | null) {
  const inline = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        activeView = view;
        this.decorations = safeBuild(view, getBaseDir());
      }
      update(update: ViewUpdate) {
        activeView = update.view;
        if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
          this.decorations = safeBuild(update.view, getBaseDir());
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
    },
  );

  return [blockField, inline];
}
