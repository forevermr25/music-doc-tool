# AI 后端代理（AWS Bedrock / Claude）

这些文档生成页面原本通过 Puter.js 在浏览器直连 AI。现已改为：

```
浏览器 (HTML)  ->  本地 Node 服务 (/api/ai/*)  ->  AWS Bedrock (Claude)
```

AWS 凭证只存在于服务端，**绝不会进入前端代码**。同一个 Node 服务还负责托管所有静态页面，所以只需一个端口、无跨域问题。

## 启动

```bash
cd server
npm install        # 首次
npm start          # 默认 http://localhost:8080
```

也可以直接双击仓库根目录的 `启动服务器.command`（macOS）或 `启动服务器.bat`（Windows）。

启动后访问：

- 配音配乐（首页）: http://localhost:8080/
- 玩法文档: http://localhost:8080/gameplay/
- Paytable: http://localhost:8080/paytable/

## 配置

复制 `.env.example` 为 `.env` 修改。关键项：

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 站点+接口端口 | 8080 |
| `AWS_REGION` | Bedrock 区域 | us-west-2 |
| `AWS_PROFILE` | 本地 AWS 凭证 profile | bedrock |
| `CLAUDE_MODEL_PRIMARY` | 主模型（原 claude-sonnet-4/默认） | Claude Sonnet 4.5 |
| `CLAUDE_MODEL_SECONDARY` | 副模型（原 gpt-4o-mini） | Claude Haiku 4.5 |
| `BEDROCK_IMAGE_MODEL` | 图片模型（美术文档用） | Nova Canvas |
| `MAX_TOKENS` | 单次回复上限 | 4096 |

凭证走 AWS SDK 默认链：环境变量 / `~/.aws/credentials`（由 `AWS_PROFILE` 选择）/ IAM 角色。

## 模型映射

前端历史上会传 `gpt-4o-mini` / `claude-sonnet-4-20250514` / `claude-3-haiku-...` 等名字。
服务端 `resolveModelId()` 统一映射到 Bedrock 的 Claude：

- 含 `mini` / `haiku` / `flash` → 副模型（更快更省）
- 已是 `*.anthropic.*` 形态的 ID → 原样透传
- 其它 → 主模型

## 接口

- `GET /api/health` — 查看当前区域与模型配置
- `POST /api/ai/chat` — `{ prompt, model?, temperature?, system? }` → `{ text, modelId, usage }`
- `POST /api/ai/image` — `{ prompt, width?, height? }` → `{ dataUrl }`

## 注意

- **GitHub Pages 等纯静态托管无法提供 AI 功能**，因为没有后端跑 Bedrock。要带 AI 部署，得把这个 Node 服务部署到能跑服务端的环境（或换成 Lambda + Function URL）。
- 根目录下的 `美术文档/`、`配音生成/`、`玩法文档生成/`、`配乐文档/` 是本仓库之外的旧副本，未改造，仍是 Puter 版。
