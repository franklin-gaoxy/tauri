/**
 * 外观全部落在 CSS 变量上：主题/字体/字号/行距/版心宽度。
 * 新增一项外观只要在这里加字段 + 一个 setProperty。
 */
export interface Appearance {
  theme: 'light' | 'dark';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
}

export interface FontPreset {
  label: string;
  value: string;
}

/** 预设几款，默认第一款；也允许手填任意字体名 */
export const FONT_PRESETS: FontPreset[] = [
  { label: '系统默认（Segoe UI + 雅黑）', value: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif' },
  { label: '等线 DengXian', value: 'DengXian, "Microsoft YaHei UI", sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "Microsoft YaHei UI", sans-serif' },
  { label: '思源黑体 Source Han Sans', value: '"Source Han Sans SC", "Noto Sans SC", sans-serif' },
  { label: '霞鹜文楷 LXGW WenKai', value: '"LXGW WenKai", "Kaiti SC", KaiTi, serif' },
  { label: '宋体 Serif', value: '"Songti SC", SimSun, "Source Han Serif SC", serif' },
  { label: '等宽（Consolas）', value: 'Consolas, "Cascadia Mono", monospace' },
];

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'light',
  fontFamily: FONT_PRESETS[0].value,
  fontSize: 16,
  lineHeight: 1.75,
  contentWidth: 780,
};

const STORAGE_KEY = 'md-editor.appearance';

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    return { ...DEFAULT_APPEARANCE, ...(JSON.parse(raw) as Partial<Appearance>) };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a: Appearance) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.theme;
  root.style.setProperty('--font-editor', a.fontFamily);
  root.style.setProperty('--editor-size', `${a.fontSize}px`);
  root.style.setProperty('--editor-line-height', String(a.lineHeight));
  root.style.setProperty('--content-width', `${a.contentWidth}px`);
}
