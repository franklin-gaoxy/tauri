/**
 * Markdown 格式化命令：都直接改文档文本，渲染交给实时预览。
 * 行级命令作用于选区覆盖的每一行；行内命令环绕选区文本（再点一次取消）。
 */
import type { EditorState, Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const linesInSelection = (state: EditorState): Line[] => {
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.to).number;
  const lines: Line[] = [];
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
  return lines;
};

const rewriteLines = (view: EditorView, fn: (text: string, index: number) => string) => {
  const lines = linesInSelection(view.state);
  view.dispatch({
    changes: lines.map((line, i) => ({ from: line.from, to: line.to, insert: fn(line.text, i) })),
    scrollIntoView: true,
  });
};

/** 去掉行首的标题 / 引用 / 列表标记，避免叠加 */
const stripBlockMark = (text: string) =>
  text.replace(/^#{1,6}\s+|^>\s?|^(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '');

/** 设置标题级别，level 为 0 表示正文 */
export function setHeading(view: EditorView, level: number) {
  rewriteLines(view, (text) => {
    const body = text.replace(/^#{1,6}\s+/, '');
    return level === 0 ? body : `${'#'.repeat(level)} ${body}`;
  });
}

/** 提升 / 降低当前行的标题级别，0 表示正文 */
export function stepHeading(view: EditorView, delta: number) {
  const line = view.state.doc.lineAt(view.state.selection.main.from);
  const match = /^(#{1,6})\s+/.exec(line.text);
  const current = match ? match[1].length : 0;
  const next = Math.min(6, Math.max(0, current + delta));
  setHeading(view, next);
}

const LIST_MARKS = {
  ul: /^(?:[-*+])\s+(?!\[[ xX]\]\s+)/,
  task: /^(?:[-*+])\s+\[[ xX]\]\s+/,
  ol: /^\d+\.\s+/,
} as const;

export function toggleList(view: EditorView, kind: keyof typeof LIST_MARKS) {
  const lines = linesInSelection(view.state);
  const isOn = lines.every((line) => LIST_MARKS[kind].test(line.text));
  rewriteLines(view, (text, i) => {
    const body = text.replace(LIST_MARKS[kind], '');
    if (isOn) return body;
    const base = stripBlockMark(body);
    if (kind === 'ul') return `- ${base}`;
    if (kind === 'task') return `- [ ] ${base}`;
    return `${i + 1}. ${base}`;
  });
}

export function toggleQuote(view: EditorView) {
  const lines = linesInSelection(view.state);
  const isOn = lines.every((line) => /^>\s?/.test(line.text));
  rewriteLines(view, (text) => {
    const body = text.replace(/^>\s?/, '');
    return isOn ? body : `> ${body}`;
  });
}

/** 行内环绕：已有标记则去掉，空选区插入占位文字并选中，方便直接输入覆盖 */
export function toggleWrap(view: EditorView, open: string, close: string, placeholder: string) {
  const { state } = view;
  const range = state.selection.main;
  const inner = state.sliceDoc(range.from, range.to);

  if (range.empty) {
    const insert = open + placeholder + close;
    view.dispatch({
      changes: { from: range.from, insert },
      selection: { anchor: range.from + open.length, head: range.from + open.length + placeholder.length },
    });
    return;
  }

  // 同一字符的连续标记（* / ** / ~~ / `）：按两侧连续标记的长度判断是否已生效。
  // 否则在 `**粗**` 里选中文字点斜体会被误判成“已包裹”，把加粗拆掉。
  if (open === close && /^(.)\1*$/.test(open)) {
    const ch = open[0];
    const before = state.sliceDoc(Math.max(0, range.from - 4), range.from);
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + 4));
    let n = 0;
    while (n < before.length && before[before.length - 1 - n] === ch) n++;
    let m = 0;
    while (m < after.length && after[m] === ch) m++;
    const want = open.length;
    if (n === m && n > 0) {
      // 奇数个 * 表示斜体，2 个及以上表示加粗（*** 两者同时生效）
      const on = want === 1 ? n % 2 === 1 : n >= want;
      if (on) {
        view.dispatch({
          changes: [
            { from: range.from - want, to: range.from, insert: '' },
            { from: range.to, to: range.to + want, insert: '' },
          ],
          selection: { anchor: range.from - want, head: range.to - want },
        });
        return;
      }
    }
  } else {
    // 成对的不同标记（如 <u>…</u>）：仍按字面判断是否已包裹
    const from = range.from - open.length;
    const to = range.to + close.length;
    if (
      from >= 0 &&
      to <= state.doc.length &&
      state.sliceDoc(from, range.from) === open &&
      state.sliceDoc(range.to, to) === close
    ) {
      view.dispatch({
        changes: { from, to, insert: inner },
        selection: { anchor: from, head: from + inner.length },
      });
      return;
    }
  }

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: open + inner + close },
    selection: { anchor: range.from + open.length, head: range.from + open.length + inner.length },
  });
}

export function clearFormat(view: EditorView) {
  const { state } = view;
  const range = state.selection.main;
  const raw = state.sliceDoc(range.from, range.to);
  const text = raw.replace(/<\/?u>|\*\*|__|~~|`|\*|_/g, '');
  if (text === raw) return;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
  });
}

/** 插入块级内容；当前行有内容时先换行，光标/选区按偏移定位到块内 */
function insertBlock(view: EditorView, text: string, caretOffset: number, caretLength = 0) {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const prefix = range.empty && line.text.trim() !== '' ? '\n' : '';
  const insert = prefix + text;
  const anchor = range.from + prefix.length + caretOffset;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor, head: anchor + caretLength },
    scrollIntoView: true,
  });
}

export function insertCodeBlock(view: EditorView) {
  const { state } = view;
  const range = state.selection.main;
  const inner = state.sliceDoc(range.from, range.to);
  insertBlock(view, '```\n' + inner + '\n```', 4, inner.length);
}

export function insertMathBlock(view: EditorView) {
  insertBlock(view, '$$\n\n$$', 3);
}

export function insertTable(view: EditorView) {
  insertBlock(view, '| 列 1 | 列 2 |\n| --- | --- |\n|  |  |', 2, 3);
}

export function insertDivider(view: EditorView) {
  insertBlock(view, '---', 3);
}

export function insertLink(view: EditorView) {
  const { state } = view;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to) || '链接文字';
  const insert = `[${text}](url)`;
  const urlFrom = range.from + text.length + 3;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: urlFrom, head: urlFrom + 3 },
  });
}

export function insertImage(view: EditorView) {
  const { state } = view;
  const range = state.selection.main;
  const alt = state.sliceDoc(range.from, range.to) || '图片描述';
  const insert = `![${alt}](path)`;
  const pathFrom = range.from + alt.length + 4;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: pathFrom, head: pathFrom + 4 },
  });
}
