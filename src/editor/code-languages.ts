/**
 * 代码块语言支持：全部按需懒加载（dynamic import），
 * 未启用的语言不会下载对应 chunk，也不会解析。
 * 启用的语言集合持久化在 localStorage，设置面板可随时增删。
 */
import { Compartment, type Extension } from '@codemirror/state';
import { LanguageDescription, LanguageSupport, type Language } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { EditorView } from '@codemirror/view';

export interface LangDef {
  id: string;
  label: string;
  /** 第一个是主名，其余是围栏里可能出现的写法 */
  aliases: string[];
  hint: string;
  defaultOn: boolean;
  load: () => Promise<Language>;
}

export const LANG_DEFS: LangDef[] = [
  {
    id: 'js',
    label: 'JavaScript',
    aliases: ['js', 'javascript', 'jsx', 'node', 'mjs'],
    hint: '≈120 KB',
    defaultOn: true,
    load: async () => (await import('@codemirror/lang-javascript')).javascript().language,
  },
  {
    id: 'ts',
    label: 'TypeScript',
    aliases: ['ts', 'typescript', 'tsx'],
    hint: '≈130 KB',
    defaultOn: true,
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }).language,
  },
  {
    id: 'py',
    label: 'Python',
    aliases: ['py', 'python', 'python3'],
    hint: '≈90 KB',
    defaultOn: true,
    load: async () => (await import('@codemirror/lang-python')).python().language,
  },
  {
    id: 'java',
    label: 'Java',
    aliases: ['java'],
    hint: '≈80 KB',
    defaultOn: true,
    load: async () => (await import('@codemirror/lang-java')).java().language,
  },
  {
    id: 'json',
    label: 'JSON',
    aliases: ['json', 'jsonc'],
    hint: '≈15 KB',
    defaultOn: true,
    load: async () => (await import('@codemirror/lang-json')).json().language,
  },
  {
    id: 'yaml',
    label: 'YAML',
    aliases: ['yaml', 'yml'],
    hint: '≈45 KB',
    defaultOn: true,
    load: async () => (await import('@codemirror/lang-yaml')).yaml().language,
  },
  {
    id: 'html',
    label: 'HTML',
    aliases: ['html', 'htm'],
    hint: '≈150 KB',
    defaultOn: false,
    load: async () => (await import('@codemirror/lang-html')).html().language,
  },
  {
    id: 'css',
    label: 'CSS',
    aliases: ['css'],
    hint: '≈55 KB',
    defaultOn: false,
    load: async () => (await import('@codemirror/lang-css')).css().language,
  },
  {
    id: 'xml',
    label: 'XML',
    aliases: ['xml', 'svg'],
    hint: '≈35 KB',
    defaultOn: false,
    load: async () => (await import('@codemirror/lang-xml')).xml().language,
  },
  {
    id: 'sql',
    label: 'SQL',
    aliases: ['sql'],
    hint: '≈240 KB',
    defaultOn: false,
    load: async () => (await import('@codemirror/lang-sql')).sql().language,
  },
  {
    id: 'cpp',
    label: 'C / C++',
    aliases: ['c', 'cpp', 'c++', 'h', 'hpp'],
    hint: '≈110 KB',
    defaultOn: false,
    load: async () => (await import('@codemirror/lang-cpp')).cpp().language,
  },
  {
    id: 'rust',
    label: 'Rust',
    aliases: ['rust', 'rs'],
    hint: '≈70 KB',
    defaultOn: false,
    load: async () => (await import('@codemirror/lang-rust')).rust().language,
  },
  {
    id: 'go',
    label: 'Go',
    aliases: ['go', 'golang'],
    hint: '≈90 KB',
    defaultOn: false,
    load: async () => (await import('@codemirror/lang-go')).go().language,
  },
  {
    id: 'php',
    label: 'PHP',
    aliases: ['php'],
    hint: '≈110 KB',
    defaultOn: false,
    load: async () => (await import('@codemirror/lang-php')).php().language,
  },
];

const STORAGE_KEY = 'md-editor.codeLangs';

function readEnabled(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const ids = JSON.parse(raw) as string[];
      return LANG_DEFS.filter((d) => ids.includes(d.id)).map((d) => d.id);
    }
  } catch {
    /* 配置坏了就用默认值 */
  }
  return LANG_DEFS.filter((d) => d.defaultOn).map((d) => d.id);
}

let enabledIds = readEnabled();

export const enabledLangIds = () => [...enabledIds];

export function setEnabledLangIds(ids: string[]) {
  enabledIds = LANG_DEFS.filter((d) => ids.includes(d.id)).map((d) => d.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledIds));
}

function descriptions(): LanguageDescription[] {
  return LANG_DEFS.filter((d) => enabledIds.includes(d.id)).map((d) =>
    LanguageDescription.of({
      name: d.aliases[0],
      alias: d.aliases.slice(1),
      load: async () => new LanguageSupport(await d.load()),
    }),
  );
}

const codeLangCompartment = new Compartment();

const markdownExt = () =>
  markdown({ base: markdownLanguage, addKeymap: true, codeLanguages: descriptions() });

/** 供编辑器初始扩展使用：markdown 语法 + 当前启用的代码语言 */
export function markdownWithCodeLanguages(): Extension {
  return codeLangCompartment.of(markdownExt());
}

/** 设置面板改动语言后调用 */
export function reconfigureCodeLanguages(view: EditorView) {
  view.dispatch({ effects: codeLangCompartment.reconfigure(markdownExt()) });
}
