@echo off
echo 正在启动本地服务器...
echo 启动后请访问: http://localhost:8080
echo.
echo 配音配乐: http://localhost:8080
echo 玩法文档: http://localhost:8080/gameplay/
echo.
echo 按 Ctrl+C 可停止服务器
echo ========================================
start http://localhost:8080
"D:\nodejs-portable\node-v20.11.1-win-x64\npx.cmd" http-server "%~dp0" -p 8080 -c-1
pause
