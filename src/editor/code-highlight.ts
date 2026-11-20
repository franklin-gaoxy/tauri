/** 代码块内的高亮配色，全部走 CSS 变量，跟随浅色/深色主题 */
import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const codeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.self], color: 'var(--code-keyword)' },
  { tag: [t.string, t.special(t.string), t.character], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--code-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--code-function)' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: 'var(--code-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--code-property)' },
  { tag: [t.tagName], color: 'var(--code-tag)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'var(--code-punct)' },
  { tag: [t.variableName, t.definition(t.variableName)], color: 'var(--fg)' },
  { tag: [t.invalid], color: '#d9534f', textDecoration: 'underline wavy' },
]);
