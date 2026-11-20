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

/** 内联 HTML 标签 → 对应样式，和 Typora 一样渲染成效果而不是显示标签 */
const INLINE_TAG_CLASS: Record<string, string> = {
  u: 'cm-underline',
  b: 'cm-strong',
  strong: 'cm-strong',
  i: 'cm-em',
  em: 'cm-em',
  s: 'cm-strike',
  del: 'cm-strike',
  strike: 'cm-strike',
  mark: 'cm-highlight',
  sub: 'cm-sub',
  sup: 'cm-sup',
  code: 'cm-inline-code',
  kbd: 'cm-kbd',
};

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
  /** 只看光标/选区头在不在这行：折叠行用它，否则有选区时行被藏起来、光标会隐身 */
  const headOn = (pos: number) => {
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

  // 切换文档时 view 还没测量，visibleRanges 为空；此时按整篇构建，
  // 否则首屏会一直保持源码模样，直到用户点一下编辑器才渲染
  const ranges = view.visibleRanges.length ? view.visibleRanges : [{ from: 0, to: doc.length }];
  /** 已由语法树 / 其它规则处理过的区间，宽松强调回退时要避开，避免重复或重叠装饰 */
  const protectedSpans: Array<{ from: number; to: number }> = [];
  const isProtected = (pos: number) => protectedSpans.some((s) => pos >= s.from && pos < s.to);
  for (const visible of ranges) {
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
          protectedSpans.push({ from: ref.from, to: ref.to });
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
          protectedSpans.push({ from: ref.from, to: ref.to });
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
          protectedSpans.push({ from: ref.from, to: ref.to });
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
          // 光标停在围栏行上：保持源码模样，才能接着敲语言（Typora 的围栏可编辑）
          const caretOnOpen = !!openLine && headOn(openLine.from);
          const caretOnClose = !!closeLine && headOn(closeLine.from);
          let firstBody = openLine ? openLine.number + 1 : doc.lineAt(ref.from).number;
          // 没有结束围栏时：围栏块会一直吃到文档末尾，但缩进代码块（4 空格）
          // 的范围就是节点自己，否则后面整篇文档都会被涂成代码框
          let lastBody = closeLine
            ? closeLine.number - 1
            : openLine
              ? doc.lines
              : doc.lineAt(ref.to > ref.from ? ref.to - 1 : ref.to).number;
          // ``` 紧跟 ``` 的空代码块：把结束围栏当成空的正文行，否则整块无处挂载。
          // 但光标还在开围栏行上时就别这么做，否则空盒子会挂到光标下面去
          const emptyBox = lastBody < firstBody && !!closeLine && !caretOnOpen;
          if (emptyBox) firstBody = lastBody = closeLine!.number;
          const hasBody = lastBody >= firstBody;

          for (let n = firstBody; n <= lastBody; n++) {
            const ln = doc.line(n);
            const cls = `cm-codeblock${n === firstBody ? ' cm-cb-first' : ''}${
              n === lastBody ? ' cm-cb-last' : ''
            }`;
            out.push(Decoration.line({ class: cls }).range(ln.from));
          }

          // 围栏行：光标不在这一行时整行折叠成高度 0 并藏掉 ```；
          // 光标停在这一行时不折叠也不藏字，露出 ``` 和语言让用户改
          const foldFence = (line: { from: number; to: number } | null, caretHere: boolean) => {
            if (!line || caretHere) return;
            out.push(Decoration.line({ class: 'cm-fence-hidden' }).range(line.from));
            hide(line.from, line.to);
          };
          if (openLine && hasBody) foldFence(openLine, caretOnOpen);
          if (closeLine) {
            if (emptyBox) {
              if (!caretOnClose) hide(closeLine.from, closeLine.to);
            } else {
              foldFence(closeLine, caretOnClose);
            }
          }

          // 右上角语言标签：挂在“已折叠的开围栏行”末尾。
          // 那一行光标永远不会停留（光标在上面时围栏不折叠），
          // 所以标签绝不会和光标位置重合；重合会让 CM 把光标高度量成 0，
          // 空代码块里就表现为“框在、框里没有竖线”
          if (name === 'FencedCode' && openLine && !caretOnOpen && hasBody) {
            const infoFrom = infoNode ? infoNode.from : marks[0].to;
            const infoTo = infoNode ? infoNode.to : infoFrom;
            out.push(
              Decoration.widget({
                widget: new LangBadgeWidget(view, infoText, infoFrom, infoTo),
                side: 1,
              }).range(openLine.to),
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
      protectedSpans.push({ from, to });
    }

    // 内联 HTML：<u>…</u>、<b>…</b> 之类，标签本身隐藏，内容套对应样式
    const tagRe = /<(u|b|strong|i|em|s|del|strike|mark|sub|sup|code|kbd)>([^<\n]*?)<\/\1>/gi;
    let tagHit: RegExpExecArray | null;
    while ((tagHit = tagRe.exec(text))) {
      const from = visible.from + tagHit.index;
      const to = from + tagHit[0].length;
      if (inCode(state, from) || replaced(from)) continue;
      const openTo = from + tagHit[1].length + 2;
      const closeFrom = to - tagHit[1].length - 3;
      mark(openTo, closeFrom, INLINE_TAG_CLASS[tagHit[1].toLowerCase()]);
      // 光标不在这一行时把标签藏起来，落在行上时露出来方便改
      if (!active(from)) {
        hide(from, openTo);
        hide(closeFrom, to);
      }
      protectedSpans.push({ from, to });
    }

    // HTML 注释：<!-- … -->，Typora 里默认不可见，这里同样隐藏；
    // 同时挡在宽松强调外面，避免注释里的 * 被当成强调标记
    const commentRe = /<!--[\s\S]*?-->/g;
    let cHit: RegExpExecArray | null;
    while ((cHit = commentRe.exec(text))) {
      const from = visible.from + cHit.index;
      const to = from + cHit[0].length;
      if (inCode(state, from) || replaced(from)) continue;
      protectedSpans.push({ from, to });
      if (!active(from)) out.push(HIDE.range(from, to));
    }

    // 宽松强调：CommonMark/GFM 要求闭合标记「右闭合」（前面不能是标点、后面不能紧跟文字），
    // Typora 不这么严格。语法树没识别出来的部分，这里按成对的 * / _ 再补一层，支持嵌套。
    const stack: Array<{ ch: string; pos: number; len: number }> = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        stack.length = 0;
        continue;
      }
      if (ch !== '*' && ch !== '_') continue;
      if (i > 0 && text[i - 1] === '\\') continue;
      let j = i;
      while (j < text.length && text[j] === ch) j++;
      const len = j - i;
      const openFrom = visible.from + i;
      if (inCode(state, openFrom) || replaced(openFrom) || isProtected(openFrom)) {
        i = j - 1;
        continue;
      }

      const top = stack[stack.length - 1];
      const opensContentAt = top ? top.pos - visible.from + top.len : -1;
      // 下划线不做词内强调，避免 snake_case 被误判
      const wordEdge =
        ch !== '_' ||
        (!/[A-Za-z0-9]/.test(text[opensContentAt - 1] ?? '') && !/[A-Za-z0-9]/.test(text[j] ?? ''));
      const canClose =
        !!top &&
        top.ch === ch &&
        top.len === len &&
        i > opensContentAt &&
        !/\s/.test(text[opensContentAt] ?? '') &&
        !/\s/.test(text[i - 1] ?? '') &&
        wordEdge;

      if (canClose) {
        stack.pop();
        const innerFrom = top!.pos + top!.len;
        const innerTo = openFrom;
        if (len >= 2) mark(innerFrom, innerTo, 'cm-strong');
        if (len !== 2) mark(innerFrom, innerTo, 'cm-em');
        if (!active(top!.pos)) {
          hide(top!.pos, innerFrom);
          hide(innerTo, openFrom + len);
        }
      } else if (j < text.length && !/\s/.test(text[j])) {
        // 只把「后面紧跟非空白」的连续标记当作潜在起始，避免列表符号、乘号被误判
        stack.push({ ch, pos: openFrom, len });
      }
      i = j - 1;
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
        // 语法树是分片解析的，后台补齐的部分也要重算，否则后半篇永远是源码
        const treeChanged = syntaxTree(update.state) !== syntaxTree(update.startState);
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          update.geometryChanged ||
          treeChanged
        ) {
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
