@echo off
rem 双击即可启动开发模式（热更新）。关闭此窗口即停止应用。
cd /d "%~dp0"
call pnpm tauri dev
echo.
echo [dev exited] press any key to close this window.
pause >nul
