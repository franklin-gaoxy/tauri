mod commands;

use std::sync::Mutex;
use tauri::{LogicalSize, Manager};

/// 便携版：可执行文件同级目录若带有固定版本 WebView2 运行时，则优先使用它，
/// 这样在没装 WebView2 的电脑上也能直接运行。
#[cfg(windows)]
fn use_bundled_webview2() {
    use std::path::PathBuf;

    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(dir) = exe.parent() else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    let runtime: Option<PathBuf> = entries.flatten().map(|entry| entry.path()).find(|path| {
        path.is_dir()
            && path
                .file_name()
                .map(|name| {
                    name.to_string_lossy()
                        .starts_with("Microsoft.WebView2.FixedVersionRuntime")
                })
                .unwrap_or(false)
    });
    let Some(runtime) = runtime else {
        return;
    };

    // WebView2 加载器会读取这个变量（Tauri 使用 fixedRuntime 配置时也是同样的做法）
    unsafe {
        std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &runtime);
    }

    grant_appcontainer_read(&runtime);
}

/// Windows 10 上固定版本 ≥ 120 的渲染进程运行在 App Container 中，
/// 需要给两个 AppContainer SID 授予读取权限，否则窗口创建失败。
/// 只需首次运行做一次；Win11 及旧版运行时不依赖该权限，失败也不影响启动。
#[cfg(windows)]
fn grant_appcontainer_read(runtime: &std::path::Path) {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let Some(parent) = runtime.parent() else {
        return;
    };
    let marker = parent.join(".webview2-acl-ok");
    if marker.exists() {
        return;
    }

    let mut granted = true;
    for sid in ["*S-1-15-2-2", "*S-1-15-2-1"] {
        let status = Command::new("icacls")
            .arg(runtime)
            .arg("/grant")
            .arg(format!("{sid}:(OI)(CI)(RX)"))
            .arg("/T")
            .arg("/C")
            .arg("/Q")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        granted &= matches!(status, Ok(code) if code.success());
    }

    if granted {
        let _ = std::fs::write(marker, b"ok");
    }
}

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
    #[cfg(windows)]
    use_bundled_webview2();

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
