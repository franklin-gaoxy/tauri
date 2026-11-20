// Windows 下一律以 GUI 子系统启动，避免调试版也弹出控制台黑窗口
#![windows_subsystem = "windows"]

fn main() {
    tauri_app_lib::run()
}
