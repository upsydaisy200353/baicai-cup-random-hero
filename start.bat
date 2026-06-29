@echo off
cd /d "%~dp0"
echo 启动本地服务器: http://localhost:8765
echo 按 Ctrl+C 停止
python -m http.server 8765
