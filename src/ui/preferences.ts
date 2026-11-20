/**
 * 偏好设置：整页式面板，左侧分类 + 右侧表单（对齐 Typora 的布局）。
 * 外观类改动即时生效；行为类开关存 localStorage，由 main 读取。
 */
import {
  DEFAULT_APPEARANCE,
  FONT_PRESETS,
  applyAppearance,
  loadAppearance,
  saveAppearance,
  type Appearance,
} from '../settings/appearance';
import { loadPrefs, resetPrefs, savePrefs, type Prefs } from '../settings/prefs';
import { LANG_DEFS, enabledLangIds, setEnabledLangIds } from '../editor/code-languages';

export interface PreferencesOptions {
  onLivePreview: (on: boolean) => void;
  onTypewriter: (on: boolean) => void;
  onCodeLanguages: () => void;
}

export interface PreferencesHandle {
  open: (section?: string) => void;
  close: () => void;
  isOpen: () => boolean;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

function row(label: string, control: HTMLElement) {
  const wrap = el('div', 'pref-row');
  const name = el('div', 'pref-label', label);
  const body = el('div', 'pref-control');
  body.appendChild(control);
  wrap.append(name, body);
  return wrap;
}

function hint(text: string) {
  return el('p', 'pref-hint', text);
}

function check(label: string, checked: boolean, onChange: (v: boolean) => void) {
  const wrap = el('label', 'pref-check');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  const text = el('span', 'pref-check-text', label);
  wrap.append(box, text);
  return wrap;
}

function select(options: Array<{ label: string; value: string }>, value: string, onChange: (v: string) => void) {
  const node = el('select', 'pref-select');
  for (const opt of options) {
    const o = el('option', undefined, opt.label);
    o.value = opt.value;
    node.appendChild(o);
  }
  node.value = value;
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

function textInput(value: string, placeholder: string, onInput: (v: string) => void) {
  const node = el('input', 'pref-input');
  node.type = 'text';
  node.value = value;
  node.placeholder = placeholder;
  node.addEventListener('input', () => onInput(node.value));
  return node;
}

function range(
  min: number,
  max: number,
  step: number,
  value: number,
  format: (v: number) => string,
  onInput: (v: number) => void,
) {
  const wrap = el('div', 'pref-range');
  const slider = el('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  const badge = el('b', 'pref-range-val', format(value));
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    badge.textContent = format(v);
    onInput(v);
  });
  wrap.append(slider, badge);
  return wrap;
}

function button(text: string, onClick: () => void) {
  const node = el('button', 'pref-btn', text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function segmented(
  options: Array<{ label: string; value: string }>,
  value: string,
  onChange: (v: string) => void,
) {
  const wrap = el('div', 'segmented');
  for (const opt of options) {
    const node = el('button', 'seg' + (opt.value === value ? ' active' : ''), opt.label);
    node.type = 'button';
    node.dataset.value = opt.value;
    node.addEventListener('click', () => {
      wrap.querySelectorAll('.seg').forEach((s) => s.classList.toggle('active', s === node));
      onChange(opt.value);
    });
    wrap.appendChild(node);
  }
  return wrap;
}

export function initPreferences(host: HTMLElement, opts: PreferencesOptions): PreferencesHandle {
  let prefs = loadPrefs();
  let appearance = loadAppearance();
  let active = 'files';

  const patchPrefs = (next: Partial<Prefs>) => {
    prefs = { ...prefs, ...next };
    savePrefs(prefs);
  };
  const patchAppearance = (next: Partial<Appearance>) => {
    appearance = { ...appearance, ...next };
    applyAppearance(appearance);
    saveAppearance(appearance);
  };

  // ------------------------------------------------------------ 框架
  host.textContent = '';
  const header = el('div', 'prefs-header');
  header.appendChild(el('span', 'prefs-title', '偏好设置'));
  const closeBtn = el('button', 'prefs-close', '×');
  closeBtn.type = 'button';
  header.appendChild(closeBtn);

  const bodyWrap = el('div', 'prefs-body');
  const nav = el('nav', 'prefs-nav');
  const search = el('input', 'prefs-search');
  search.type = 'text';
  search.placeholder = '查找';
  const navList = el('div', 'prefs-nav-list');
  nav.append(search, navList);
  const content = el('section', 'prefs-content');
  bodyWrap.append(nav, content);
  host.append(header, bodyWrap);

  // ------------------------------------------------------------ 各分类内容
  const sections: Array<{ id: string; label: string; build: () => void }> = [
    {
      id: 'files',
      label: '文件',
      build: () => {
        content.append(el('h2', 'pref-h2', '文件'));
        content.append(
          row(
            '启动选项',
            select(
              [
                { label: '打开新文件', value: 'new' },
                { label: '恢复上次打开的文件夹', value: 'restore' },
              ],
              prefs.startMode,
              (v) => patchPrefs({ startMode: v === 'new' ? 'new' : 'restore' }),
            ),
          ),
          row(
            '保存 & 恢复',
            check('编辑后自动保存', prefs.autoSave, (v) => patchPrefs({ autoSave: v })),
          ),
          row(
            '',
            check('切换文件时自动保存对上一个文件的更改', prefs.autoSaveOnSwitch, (v) =>
              patchPrefs({ autoSaveOnSwitch: v }),
            ),
          ),
          row(
            '最近使用的目录',
            check('记录历史文件和文件夹', prefs.recordHistory, (v) => patchPrefs({ recordHistory: v })),
          ),
          row(
            '',
            button('清除历史记录', () => {
              localStorage.removeItem('md-editor.root');
              localStorage.removeItem('md-editor.lastFile');
            }),
          ),
        );
        content.append(hint('启动选项在下次启动时生效。'));
      },
    },
    {
      id: 'editor',
      label: '编辑器',
      build: () => {
        content.append(el('h2', 'pref-h2', '编辑器'));
        const indentBox = el('div', 'pref-inline');
        indentBox.append(
          select(
            [
              { label: '2', value: '2' },
              { label: '4', value: '4' },
              { label: '8', value: '8' },
            ],
            String(prefs.indent),
            (v) => patchPrefs({ indent: Number(v) }),
          ),
          check('对齐缩进', prefs.alignIndent, (v) => patchPrefs({ alignIndent: v })),
        );
        content.append(row('默认缩进', indentBox));
        content.append(
          row(
            '使用成对的符号',
            check('匹配括号和引号', prefs.matchBrackets, (v) => patchPrefs({ matchBrackets: v })),
          ),
        );
        content.append(
          row(
            '即时渲染',
            check('显示 Markdown 渲染结果（关闭后为源码模式）', prefs.livePreview, (v) => {
              patchPrefs({ livePreview: v });
              opts.onLivePreview(v);
            }),
          ),
        );
        content.append(
          row(
            '默认换行符',
            (() => {
              const wrap = el('div', 'pref-inline');
              wrap.append(
                check('LF (Unix Style)', prefs.eol === 'lf', (v) => {
                  if (v) patchPrefs({ eol: 'lf' });
                  renderNav(active);
                }),
                check('CRLF (Windows Style)', prefs.eol === 'crlf', (v) => {
                  if (v) patchPrefs({ eol: 'crlf' });
                  renderNav(active);
                }),
              );
              return wrap;
            })(),
          ),
        );
        content.append(
          row(
            '打字机模式',
            check('在打字机模式下，始终保证光标在屏幕中间', prefs.typewriter, (v) => {
              patchPrefs({ typewriter: v });
              opts.onTypewriter(v);
            }),
          ),
        );
        content.append(hint('（部分选项需要重启后生效）'));
      },
    },
    {
      id: 'image',
      label: '图像',
      build: () => {
        content.append(el('h2', 'pref-h2', '图像'));
        content.append(
          row(
            '插入图片时',
            select(
              [
                { label: '复制图片到 ./assets 文件夹', value: 'assets' },
                { label: '保留图片原位置', value: 'keep' },
              ],
              prefs.imgRule,
              (v) => patchPrefs({ imgRule: v === 'keep' ? 'keep' : 'assets' }),
            ),
          ),
          row(
            '图片语法偏好',
            check('优先使用相对路径', prefs.relativePath, (v) => patchPrefs({ relativePath: v })),
          ),
        );
      },
    },
    {
      id: 'markdown',
      label: 'Markdown',
      build: () => {
        content.append(el('h2', 'pref-h2', 'Markdown'))

        const langList = el('div', 'lang-list');
        const enabled = new Set(enabledLangIds());
        for (const def of LANG_DEFS) {
          const item = el('label', 'lang-row');
          const box = el('input');
          box.type = 'checkbox';
          box.checked = enabled.has(def.id);
          box.addEventListener('change', () => {
            const next = new Set(enabledLangIds());
            if (box.checked) next.add(def.id);
            else next.delete(def.id);
            setEnabledLangIds([...next]);
            count.textContent = `${next.size}/${LANG_DEFS.length}`;
            opts.onCodeLanguages();
          });
          item.append(box, el('span', 'lang-name', def.label), el('span', 'lang-hint', def.hint));
          langList.appendChild(item);
        }
        const count = el('b', 'pref-count', `${enabled.size}/${LANG_DEFS.length}`);
        const label = el('div', 'pref-label');
        label.append(el('span', undefined, '代码块语言'), count);
        const langRow = el('div', 'pref-row');
        const langBody = el('div', 'pref-control');
        langBody.append(langList, hint('勾选的语言才会按需加载；未勾选的代码块显示为纯文本。'));
        langRow.append(label, langBody);

        content.append(
          langRow,
          row('数学公式', check('启用 $...$ 与 $$...$$', prefs.math, (v) => patchPrefs({ math: v }))),
          row('图表', check('启用 Mermaid 代码块渲染', prefs.mermaid, (v) => patchPrefs({ mermaid: v }))),
        );
      },
    },
    {
      id: 'export',
      label: '导出',
      build: () => {
        content.append(el('h2', 'pref-h2', '导出'));
        content.append(
          row(
            '导出格式',
            select(
              [
                { label: 'HTML', value: 'html' },
                { label: 'PDF', value: 'pdf' },
              ],
              'html',
              () => undefined,
            ),
          ),
          row('', button('导出当前文档（开发中）', () => undefined)),
        );
        content.append(hint('导出功能尚未接通，后续版本补齐。'));
      },
    },
    {
      id: 'appearance',
      label: '外观',
      build: () => {
        content.append(el('h2', 'pref-h2', '外观'));
        content.append(
          row(
            '主题',
            segmented(
              [
                { label: '浅色', value: 'light' },
                { label: '深色', value: 'dark' },
              ],
              appearance.theme,
              (v) => patchAppearance({ theme: v === 'dark' ? 'dark' : 'light' }),
            ),
          ),
        );

        const font = select(
          FONT_PRESETS.map((p) => ({ label: p.label, value: p.value })),
          FONT_PRESETS.some((p) => p.value === appearance.fontFamily) ? appearance.fontFamily : '',
          (v) => {
            if (v) patchAppearance({ fontFamily: v });
          },
        );
        font.classList.add('pref-select-wide');
        content.append(row('字体预设', font));
        content.append(
          row(
            '自定义字体',
            textInput('', '填任意已安装字体名，留空用预设', (v) => {
              const value = v.trim();
              if (value) patchAppearance({ fontFamily: `"${value}", var(--font-ui)` });
            }),
          ),
        );
        content.append(
          row(
            '字号',
            range(12, 24, 1, appearance.fontSize, (v) => `${v}px`, (v) => patchAppearance({ fontSize: v })),
          ),
          row(
            '行距',
            range(1.3, 2.4, 0.05, appearance.lineHeight, (v) => v.toFixed(2), (v) =>
              patchAppearance({ lineHeight: v }),
            ),
          ),
          row(
            '版心宽度',
            range(560, 1100, 10, appearance.contentWidth, (v) => `${v}px`, (v) =>
              patchAppearance({ contentWidth: v }),
            ),
          ),
        );
        content.append(
          row(
            '',
            button('恢复默认外观', () => {
              appearance = { ...DEFAULT_APPEARANCE };
              applyAppearance(appearance);
              saveAppearance(appearance);
              renderNav(active);
            }),
          ),
        );
      },
    },
    {
      id: 'general',
      label: '通用',
      build: () => {
        content.append(el('h2', 'pref-h2', '通用'));
        content.append(
          row(
            '语言',
            select([{ label: '简体中文', value: 'zh-CN' }], 'zh-CN', () => undefined),
          ),
          row('版本', (() => el('div', 'pref-static', 'Markdown 编辑器 0.1.0 · Tauri 2 + CodeMirror 6'))()),
          row(
            '高级设置',
            button('重置所有偏好', () => {
              prefs = resetPrefs();
              appearance = { ...DEFAULT_APPEARANCE };
              applyAppearance(appearance);
              saveAppearance(appearance);
              opts.onLivePreview(prefs.livePreview);
              opts.onTypewriter(prefs.typewriter);
              renderNav('general');
            }),
          ),
        );
      },
    },
  ];

  // ------------------------------------------------------------ 渲染
  const renderNav = (id: string) => {
    active = id;
    navList.textContent = '';
    for (const section of sections) {
      const node = el('button', 'prefs-nav-item' + (section.id === id ? ' active' : ''), section.label);
      node.type = 'button';
      node.addEventListener('click', () => renderNav(section.id));
      navList.appendChild(node);
    }
    content.textContent = '';
    const target = sections.find((s) => s.id === id) ?? sections[0];
    target.build();
  };

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    navList.querySelectorAll<HTMLElement>('.prefs-nav-item').forEach((node) => {
      node.hidden = q !== '' && !(node.textContent ?? '').toLowerCase().includes(q);
    });
  });

  const close = () => {
    host.hidden = true;
  };
  const open = (section?: string) => {
    prefs = loadPrefs();
    appearance = loadAppearance();
    host.hidden = false;
    if (section && sections.some((s) => s.id === section)) active = section;
    renderNav(active);
  };

  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !host.hidden) close();
  });

  renderNav(active);
  return { open, close, isOpen: () => !host.hidden };
}
