import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap,
  placeholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { bracketMatching, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { livePreview } from './livepreview';
import { markdownKeys, markdownPointer } from './keymap';
import { fenceGuard } from './fence';
import { markdownWithCodeLanguages } from './code-languages';
import { codeHighlight } from './code-highlight';
import { insertLink, toggleWrap } from './format';
import { focusMode, typewriterMode } from './modes';

export interface EditorOptions {
  parent: HTMLElement;
  getBaseDir: () => string | null;
  onChange: (doc: string) => void;
  onCursor: (line: number) => void;
  onSave: () => void;
}

/** 编辑器自身样式全部走 CSS 变量，方便外观面板接管 */
const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'calc(var(--editor-size) * var(--editor-zoom, 1))', color: 'var(--fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-editor)',
    lineHeight: 'var(--editor-line-height)',
  },
  '.cm-content': {
    maxWidth: 'var(--content-width)',
    margin: '0 auto',
    padding: '40px 32px 45vh',
    caretColor: 'var(--accent)',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection)' },
  '.cm-placeholder': { color: 'var(--fg-faint)' },
});

const previewCompartment = new Compartment();
const focusCompartment = new Compartment();
const typewriterCompartment = new Compartment();

export interface EditorHandle {
  view: EditorView;
  setDoc: (text: string) => void;
  focus: () => void;
  /** 源码模式：关掉所见即所得渲染 */
  setSourceMode: (on: boolean) => void;
  setFocusMode: (on: boolean) => void;
  setTypewriter: (on: boolean) => void;
}

export function createEditor(opts: EditorOptions): EditorHandle {
  let sourceMode = false;

  const extensions = (): Extension[] => [
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    bracketMatching(),
    markdownWithCodeLanguages(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    syntaxHighlighting(codeHighlight),
    EditorView.lineWrapping,
    // 围栏输入护栏：自动补结束围栏 + 光标不留在折叠行上
    fenceGuard(),
    markdownKeys,
    markdownPointer,
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          opts.onSave();
          return true;
        },
      },
      {
        key: 'Mod-b',
        preventDefault: true,
        run: (v) => {
          toggleWrap(v, '**', '**', '粗体');
          return true;
        },
      },
      {
        key: 'Mod-i',
        preventDefault: true,
        run: (v) => {
          toggleWrap(v, '*', '*', '斜体');
          return true;
        },
      },
      {
        key: 'Mod-k',
        preventDefault: true,
        run: (v) => {
          insertLink(v);
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange(u.state.doc.toString());
      if (u.docChanged || u.selectionSet) {
        opts.onCursor(u.state.doc.lineAt(u.state.selection.main.head).number);
      }
    }),
    previewCompartment.of(sourceMode ? [] : livePreview(opts.getBaseDir)),
    focusCompartment.of([]),
    typewriterCompartment.of([]),
    placeholder('开始写作，或从左侧选择文件…'),
    theme,
  ];

  const view = new EditorView({
    state: EditorState.create({ doc: '', extensions: extensions() }),
    parent: opts.parent,
  });

  /** 切换文档：重建 state，避免撤销历史串到别的文件 */
  const setDoc = (text: string) => {
    view.setState(EditorState.create({ doc: text, extensions: extensions() }));
    view.scrollDOM.scrollTop = 0;
  };

  return {
    view,
    setDoc,
    focus: () => view.focus(),
    setSourceMode: (on: boolean) => {
      sourceMode = on;
      view.dispatch({
        effects: previewCompartment.reconfigure(on ? [] : livePreview(opts.getBaseDir)),
      });
    },
    setFocusMode: (on: boolean) => {
      view.dispatch({ effects: focusCompartment.reconfigure(on ? focusMode() : []) });
    },
    setTypewriter: (on: boolean) => {
      view.dispatch({ effects: typewriterCompartment.reconfigure(on ? typewriterMode() : []) });
    },
  };
}
