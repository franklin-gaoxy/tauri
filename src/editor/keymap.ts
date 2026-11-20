/**
 * 代码块的“出口”只放在方向键和鼠标上，Enter 永远是纯换行：
 * - ↓：光标在代码块最后一行 / 结束围栏行时跳到块外（未闭合则自动补结束围栏）
 * - ↓：文档末尾追加普通空行
 * - 鼠标点内容区下方空白：同上
 */
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { closeFenceAtEndAction, exitFenceAction, type ExitAction } from './fence';

function applyExit(view: EditorView, action: ExitAction) {
  view.dispatch({
    changes: action.insert ? { from: action.from, insert: action.insert } : undefined,
    selection: { anchor: action.anchor },
    scrollIntoView: true,
  });
}

function appendLine(view: EditorView) {
  const doc = view.state.doc;
  view.dispatch({
    changes: { from: doc.length, insert: '\n' },
    selection: { anchor: doc.length + 1 },
    scrollIntoView: true,
  });
}

function arrowDown(view: EditorView): boolean {
  const state = view.state;
  if (!state.selection.main.empty) return false;

  const exit = exitFenceAction(state);
  if (exit) {
    applyExit(view, exit);
    return true;
  }

  const doc = state.doc;
  const head = state.selection.main.head;
  if (head === doc.length && doc.length > 0 && doc.lineAt(doc.length).text.trim() !== '') {
    appendLine(view);
    return true;
  }

  return false;
}

/** 点内容区下方空白：末尾若在未闭合代码块里，先收尾再落光标 */
function clickBelowContent(event: MouseEvent, view: EditorView): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.cm-line')) return false;

  const doc = view.state.doc;
  if (doc.length === 0) return false;

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null || pos < doc.length) return false;

  const close = closeFenceAtEndAction(view.state);
  if (close) {
    applyExit(view, close);
  } else {
    appendLine(view);
  }
  view.focus();
  return true;
}

export const markdownKeys = Prec.highest(keymap.of([{ key: 'ArrowDown', run: arrowDown }]));

export const markdownPointer = EditorView.domEventHandlers({ mousedown: clickBelowContent });
