/**
 * 全项目唯一的 IPC 出口。
 * 业务代码只能 import 这里的函数，禁止直接 invoke / listen。
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children: FileNode[] | null;
}

/** 系统原生目录选择框，取消返回 null */
export async function pickFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title: '选择 Markdown 目录' });
  return typeof picked === 'string' ? picked : null;
}

/** 系统原生文件选择框，取消返回 null */
export async function pickFile(): Promise<string | null> {
  const picked = await open({
    directory: false,
    multiple: false,
    title: '打开 Markdown 文件',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }],
  });
  return typeof picked === 'string' ? picked : null;
}

/** 读取目录的一层内容；展开子目录时再调用一次 */
export const listTree = (root: string) => invoke<FileNode[]>('list_tree', { root });

export const readFile = (path: string) => invoke<string>('read_file', { path });

export const writeFile = (path: string, content: string) =>
  invoke<void>('write_file', { path, content });

export const readImage = (path: string) => invoke<number[]>('read_image', { path });

/** 新建空文件，同名已存在会报错 */
export const createFile = (path: string) => invoke<void>('create_file', { path });

/** 监听当前文档，外部改动时回调（同一次监听会自动替换上一次） */
export const watchFile = (path: string) => invoke<void>('watch_file', { path });

export const onFsChanged = (cb: (path: string) => void): Promise<UnlistenFn> =>
  listen<string>('fs-changed', (e) => cb(e.payload));

// ---------------------------------------------------------------- 窗口

/** 设置原生标题栏文字（Typora 风格：文件名 - 应用名）；浏览器调试环境下静默忽略 */
export async function setWindowTitle(title: string) {
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    /* 非 Tauri 环境（如 Vite 预览）没有窗口 API */
  }
}

/** 切换全屏，返回切换后的状态；浏览器调试环境直接忽略 */
export async function toggleFullscreen(): Promise<boolean> {
  try {
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen());
    await win.setFullscreen(next);
    return next;
  } catch {
    return false;
  }
}

export async function closeWindow() {
  try {
    await getCurrentWindow().close();
  } catch {
    window.close();
  }
}
