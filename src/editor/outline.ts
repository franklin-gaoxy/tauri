import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export interface Heading {
  level: number;
  text: string;
  line: number;
  from: number;
}

const HEADING = /^(ATXHeading|SetextHeading)([1-6])$/;

/** 直接从语法树提取标题，不额外解析一遍全文 */
export function extractHeadings(state: EditorState): Heading[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 2000) ?? syntaxTree(state);
  const out: Heading[] = [];

  tree.iterate({
    enter: (n) => {
      const m = HEADING.exec(n.name);
      if (!m) return;
      const line = state.doc.lineAt(n.from);
      const text = line.text
        .replace(/^\s{0,3}#{1,6}\s*/, '')
        .replace(/\s*#+\s*$/, '')
        .replace(/^\s{0,3}(=+|-+)\s*$/, '')
        .trim();
      out.push({ level: Number(m[2]), text: text || '(空标题)', line: line.number, from: line.from });
    },
  });

  return out;
}
