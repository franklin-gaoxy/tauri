/**
 * 围栏代码块的“出口”判定，纯函数，只依赖 EditorState，方便单独验证。
 *
 * 两种情形：
 * 1. 有结束围栏：光标在最后一行内容或围栏行时，往下走 = 在围栏下面新插普通行
 * 2. 没有结束围栏（还在写）：围栏会吞掉后面所有内容，跳出时自动补上结束围栏
 */
import { syntaxTree } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';

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

/** 光标所在行是围栏的「开行」时，返回该行的结束位置（不论块是否已闭合） */
export function openingFenceLine(state: EditorState, head: number): number | null {
  const fence = fencedAncestor(state, head);
  if (!fence) return null;

  const marks = codeMarks(fence);
  if (marks.length < 1) return null;

  const doc = state.doc;
  const openLine = doc.lineAt(marks[0].from);
  if (doc.lineAt(head).number !== openLine.number) return null;
  return openLine.to;
}

/**
 * 围栏行相关的输入护栏：
 * 刚敲完开围栏、下面还有内容时立刻补一个结束围栏，
 * 否则未闭合围栏会把下面整段（包括已有的代码块）吞进来，看起来像“合并”。
 *
 * 注意：不再把光标从围栏行上挪走 —— 光标停在围栏行时该行会露出源码，
 * 这样敲完 ``` 还能继续输入语言。
 */
export function fenceGuard(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !tr.isUserEvent('input')) return tr;

    const head = tr.state.selection.main.head;
    const lineTo = openingFenceLine(tr.state, head);
    // 这一行原本就是围栏 → 说明在改语言串，别再插一个
    const startHead = Math.min(tr.startState.selection.main.head, tr.startState.doc.length);
    if (lineTo === null || openingFenceLine(tr.startState, startHead) !== null) return tr;
    // 下面没有实际内容就按普通 markdown 处理，免得正常写代码时多插围栏
    if (tr.state.doc.sliceString(lineTo).trim() === '') return tr;
    return [
      tr,
      {
        changes: { from: lineTo, insert: '\n```' },
        selection: { anchor: head },
        sequential: true,
      },
    ];
  });
}

export interface FenceDeleteAction {
  from: number;
  to: number;
  anchor: number;
}

/**
 * 空代码块（``` 紧跟着 ```）上按退格：整块删掉。
 * 交给默认行为的话，两行围栏会被拼成一行（```python```），
 * 变成一个吞掉后面所有内容的新代码块 —— 看起来就像“和下面的块合并了”。
 */
export function removeEmptyFenceAction(state: EditorState, head: number): FenceDeleteAction | null {
  const fence = fencedAncestor(state, head);
  if (!fence) return null;

  const marks = codeMarks(fence);
  if (marks.length < 2) return null;

  const doc = state.doc;
  const openLine = doc.lineAt(marks[0].from);
  const closeLine = doc.lineAt(marks[marks.length - 1].from);
  // 光标在开围栏行上（正在敲 ``` 或语言串）：按普通退格删字符
  if (doc.lineAt(head).number === openLine.number) return null;
  // 有正文行就不是空块，保持默认退格行为
  if (closeLine.number - openLine.number !== 1) return null;

  // 连块后的换行一起吃掉，避免留下多余空行
  const to = closeLine.to < doc.length ? closeLine.to + 1 : closeLine.to;
  return { from: openLine.from, to, anchor: openLine.from };
}

/** 点击内容区下方：文档末尾若还在未闭合围栏里，先补结束围栏 */
export function closeFenceAtEndAction(state: EditorState): ExitAction | null {
  const fence = fencedAncestor(state, state.doc.length);
  if (!fence) return null;
  if (codeMarks(fence).length >= 2) return null;
  return closeFenceAction(state);
}
