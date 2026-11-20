/** 非外观类偏好：行为开关，统一存 localStorage */
export interface Prefs {
  startMode: 'new' | 'restore';
  autoSave: boolean;
  autoSaveOnSwitch: boolean;
  recordHistory: boolean;
  indent: number;
  alignIndent: boolean;
  matchBrackets: boolean;
  livePreview: boolean;
  eol: 'lf' | 'crlf';
  typewriter: boolean;
  imgRule: 'assets' | 'keep';
  relativePath: boolean;
  math: boolean;
  mermaid: boolean;
  zoom: number;
}

export const DEFAULT_PREFS: Prefs = {
  startMode: 'restore',
  autoSave: true,
  autoSaveOnSwitch: true,
  recordHistory: true,
  indent: 2,
  alignIndent: true,
  matchBrackets: true,
  livePreview: true,
  eol: 'lf',
  typewriter: false,
  imgRule: 'assets',
  relativePath: true,
  math: true,
  mermaid: true,
  zoom: 1,
};

const STORAGE_KEY = 'md-editor.prefs';

let cache: Prefs | null = null;

export function loadPrefs(): Prefs {
  if (cache) return { ...cache };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULT_PREFS };
  } catch {
    cache = { ...DEFAULT_PREFS };
  }
  return { ...cache };
}

export function savePrefs(next: Prefs) {
  cache = { ...next };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export function resetPrefs() {
  cache = { ...DEFAULT_PREFS };
  localStorage.removeItem(STORAGE_KEY);
  return { ...cache };
}
