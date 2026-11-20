/** 专注模式：非当前段落淡出；打字机模式：光标始终留在屏幕中间 */
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';

const DIM = Decoration.line({ class: 'cm-focus-dim' });

function paragraphRange(state: EditorState) {
  const head = state.selection.main.head;
  let start = state.doc.lineAt(head).number;
  let end = start;
  while (start > 1 && state.doc.line(start - 1).text.trim() !== '') start -= 1;
  while (end < state.doc.lines && state.doc.line(end + 1).text.trim() !== '') end += 1;
  return { from: state.doc.line(start).from, to: state.doc.line(end).to, start, end };
}

function buildFocus(view: EditorView): DecorationSet {
  const { state } = view;
  const { from, to } = paragraphRange(state);
  const out = [];
  for (const visible of view.visibleRanges) {
    let pos = visible.from;
    while (pos <= visible.to) {
      const line = state.doc.lineAt(pos);
      if (line.to < from || line.from > to) out.push(DIM.range(line.from));
      if (line.to + 1 > visible.to) break;
      pos = line.to + 1;
    }
  }
  return Decoration.set(out, true);
}

export function focusMode() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildFocus(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildFocus(update.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function typewriterMode() {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    const view = update.view;
    const head = update.state.selection.main.head;
    requestAnimationFrame(() => {
      if (!view.dom.isConnected) return;
      view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
    });
  });
}
