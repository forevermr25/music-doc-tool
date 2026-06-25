#!/bin/bash
# macOS 启动脚本：双击运行，或在终端执行 ./启动服务器.command
cd "$(dirname "$0")/server" || exit 1

echo "========================================"
echo " AI Slots Tools 本地服务器 (Bedrock 版)"
echo " 站点: http://localhost:8080"
echo "========================================"

if [ ! -d node_modules ]; then
  echo "首次启动，安装依赖 npm install ..."
  npm install
fi

# 打开浏览器（稍等服务器起来）
( sleep 2 && open http://localhost:8080 ) &

npm start
