/**
 * 围栏代码块的“出口”判定，纯函数，只依赖 EditorState，方便单独验证。
 *
 * 两种情形：
 * 1. 有结束围栏：光标在最后一行内容或围栏行时，往下走 = 在围栏下面新插普通行
 * 2. 没有结束围栏（还在写）：围栏会吞掉后面所有内容，跳出时自动补上结束围栏
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

interface Node {
  name: string;
  from: number;
  to: number;
  firstChild: Node | null;
  nextSibling: Node | null;
  parent: Node | null;
}

export interface ExitAction {
  from: number;
  insert: string;
  anchor: number;
}

function fencedAncestor(state: EditorState, pos: number): Node | null {
  const tree = syntaxTree(state);
  const at = Math.min(pos, state.doc.length);
  // 落在节点边界上时，side=-1 会解析到左边的兄弟/父级（文档开头甚至是 Document），
  // 所以两个方向都试一次
  for (const side of [-1, 1] as const) {
    let node = tree.resolveInner(at, side) as unknown as Node | null;
    while (node && node.name !== 'FencedCode') node = node.parent;
    if (node) return node;
  }
  return null;
}

function codeMarks(fence: Node): Node[] {
  const marks: Node[] = [];
  for (let c = fence.firstChild; c; c = c.nextSibling) {
    if (c.name === 'CodeMark') marks.push(c);
  }
  return marks;
}

/** 在文档末尾补结束围栏，光标落到围栏下方的新行 */
function closeFenceAction(state: EditorState): ExitAction {
  const doc = state.doc;
  const last = doc.lineAt(doc.length);
  const insert = (last.text === '' ? '' : '\n') + '```\n';
  return { from: doc.length, insert, anchor: doc.length + insert.length };
}

/** ↓ 键：只在代码块最后一行 / 结束围栏行生效 */
export function exitFenceAction(state: EditorState): ExitAction | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;

  const doc = state.doc;
  const line = doc.lineAt(sel.head);
  const fence = fencedAncestor(state, sel.head);
  if (!fence) return null;

  const marks = codeMarks(fence);
  if (marks.length < 2) {
    // 未闭合：围栏一直吃到文档末尾，站在最后两行（最后内容行 / 末尾空行）时补围栏跳出
    if (line.number < doc.lines - 1) return null;
    return closeFenceAction(state);
  }

  const closing = doc.lineAt(marks[marks.length - 1].from);
  if (line.number < closing.number - 1) return null;

  return { from: closing.to, insert: '\n', anchor: closing.to + 1 };
}

/**
 * 围栏行是折叠（高度 0）的，光标停进去会“隐身”：
 * 落到开/结束围栏行时把光标挪到相邻的代码行上。
 */
export function fenceCaretRedirect(state: EditorState, head: number): number | null {
  const fence = fencedAncestor(state, head);
  if (!fence) return null;

  const marks = codeMarks(fence);
  if (marks.length < 2) return null;

  const doc = state.doc;
  const openLine = doc.lineAt(marks[0].from);
  const closeLine = doc.lineAt(marks[marks.length - 1].from);
  const firstBody = openLine.number + 1;
  const lastBody = closeLine.number - 1;
  if (lastBody < firstBody) return null;

  const line = doc.lineAt(head);
  if (line.number === openLine.number) return doc.line(firstBody).from;
  if (line.number === closeLine.number) return doc.line(lastBody).to;
  return null;
}

/** 点击内容区下方：文档末尾若还在未闭合围栏里，先补结束围栏 */
export function closeFenceAtEndAction(state: EditorState): ExitAction | null {
  const fence = fencedAncestor(state, state.doc.length);
  if (!fence) return null;
  if (codeMarks(fence).length >= 2) return null;
  return closeFenceAction(state);
}
