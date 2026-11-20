mod commands;

use std::sync::Mutex;
use tauri::{LogicalSize, Manager};

/// 按主屏可用区域的比例决定初始窗口大小，并居中
fn fit_window_to_screen(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let screen = monitor.size().to_logical::<f64>(monitor.scale_factor());

    // 约 3/4 屏：宽 76%、高 82%，并留出任务栏/边框余量
    let width = (screen.width * 0.76).min(screen.width - 80.0).max(960.0);
    let height = (screen.height * 0.82).min(screen.height - 80.0).max(640.0);

    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.center();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                fit_window_to_screen(&window);
            }
            Ok(())
        })
        .manage(commands::watch::WatchHandle(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::fs::list_tree,
            commands::fs::read_file,
            commands::fs::read_image,
            commands::fs::create_file,
            commands::fs::write_file,
            commands::watch::watch_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
