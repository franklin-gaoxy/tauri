use notify::{RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// 只保留当前文档的一个监听器，切换文件时替换
pub struct WatchHandle(pub Mutex<Option<notify::RecommendedWatcher>>);

/// 监听当前打开的文件，外部改动时向前端广播 `fs-changed`
#[tauri::command]
pub fn watch_file(
    app: AppHandle,
    state: State<'_, WatchHandle>,
    path: String,
) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = target
        .parent()
        .ok_or_else(|| "无效的文件路径".to_string())?
        .to_path_buf();

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None; // 释放上一个监听器

    let watched = target.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if event.paths.iter().any(|p| p == &watched) {
            let _ = app.emit("fs-changed", watched.to_string_lossy().to_string());
        }
    })
    .map_err(|e| format!("创建监听失败: {e}"))?;

    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| format!("监听目录失败: {e}"))?;

    *guard = Some(watcher);
    Ok(())
}
