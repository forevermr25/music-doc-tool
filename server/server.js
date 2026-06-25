// =============================================================================
// AI Slots Tools - 本地代理服务器
// 同时托管静态站点 + 把 AI 调用桥接到 AWS Bedrock (Claude)
// 浏览器 -> 本服务 (/api/ai/*) -> Bedrock。AWS 凭证只存在于服务端，绝不进前端。
// =============================================================================
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.join(__dirname, '..'); // music-doc-tool 根目录

// ---- 配置（可用环境变量覆盖，见 .env.example）---------------------------------
const PORT = process.env.PORT || 8080;
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-2';

// 文本模型映射：所有调用最终都走 Bedrock 的 Claude。
// - PRIMARY 对应原来的 'claude-sonnet-4-*'（以及默认）
// - SECONDARY 对应原来的 'gpt-4o-mini'（保留"双版本对比"时给出不同/更快更省的第二版）
const MODEL_PRIMARY = process.env.CLAUDE_MODEL_PRIMARY || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const MODEL_SECONDARY = process.env.CLAUDE_MODEL_SECONDARY || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const IMAGE_MODEL = process.env.BEDROCK_IMAGE_MODEL || 'amazon.titan-image-generator-v2:0';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096', 10);

// 把前端传来的 model 名（历史遗留的 gpt-4o-mini / claude-*）映射到 Bedrock 模型 ID
function resolveModelId(model) {
  if (!model) return MODEL_PRIMARY;
  const m = String(model).toLowerCase();
  // 历史上的"第二版/便宜版"标识 -> 走更快的 Claude
  if (m.includes('mini') || m.includes('haiku') || m.includes('gpt-3') || m.includes('flash')) {
    return MODEL_SECONDARY;
  }
  // 已经是 Bedrock 形态的 ID（含 anthropic.claude）直接透传
  if (m.startsWith('us.anthropic') || m.startsWith('global.anthropic') || m.startsWith('anthropic.')) {
    return model;
  }
  // 其它（claude-sonnet-4 等）一律走主模型
  return MODEL_PRIMARY;
}

const bedrock = new BedrockRuntimeClient({ region: REGION });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---- 健康检查 ----------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    region: REGION,
    primary: MODEL_PRIMARY,
    secondary: MODEL_SECONDARY,
    imageModel: IMAGE_MODEL,
  });
});

// ---- 文本生成：等价于旧的 puter.ai.chat ---------------------------------------
// 请求体: { prompt: string, model?: string, temperature?: number, system?: string }
// 响应体: { text: string, modelId: string, usage?: {...} }
app.post('/api/ai/chat', async (req, res) => {
  const { prompt, model, temperature, system } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt (string) is required' });
  }
  const modelId = resolveModelId(model);
  try {
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      ...(system ? { system: [{ text: system }] } : {}),
      inferenceConfig: {
        maxTokens: MAX_TOKENS,
        temperature: typeof temperature === 'number' ? temperature : 0.8,
      },
    });
    const out = await bedrock.send(cmd);
    const parts = out?.output?.message?.content || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    res.json({ text, modelId, usage: out?.usage });
  } catch (err) {
    console.error('[chat] error:', err?.name, err?.message);
    res.status(502).json({ error: err?.message || 'bedrock error', modelId });
  }
});

// ---- 图片生成：等价于旧的 puter.ai.txt2img（用 Bedrock 图片模型）-------------
// 兼容两类模型：
//   - Titan / Nova Canvas: body 用 taskType=TEXT_IMAGE，返回 { images:[base64] }
//   - Stability (stable-image-*): body 用 prompt/aspect_ratio，返回 { images:[base64] } 或 { body:base64 }
// 请求体: { prompt: string, width?: number, height?: number }
// 响应体: { dataUrl: string }  -> "data:image/png;base64,...."
app.post('/api/ai/image', async (req, res) => {
  const { prompt, width, height } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt (string) is required' });
  }
  const isStability = IMAGE_MODEL.startsWith('stability.');
  try {
    let body;
    if (isStability) {
      body = { prompt, mode: 'text-to-image', aspect_ratio: '1:1', output_format: 'png' };
    } else {
      body = {
        taskType: 'TEXT_IMAGE',
        textToImageParams: { text: prompt },
        imageGenerationConfig: {
          numberOfImages: 1,
          width: width || 1024,
          height: height || 1024,
          cfgScale: 7.5,
        },
      };
    }
    const cmd = new InvokeModelCommand({
      modelId: IMAGE_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });
    const out = await bedrock.send(cmd);
    const payload = JSON.parse(new TextDecoder().decode(out.body));
    const b64 = (payload.images && payload.images[0]) || payload.body || payload.image;
    if (!b64) throw new Error('no image returned');
    res.json({ dataUrl: `data:image/png;base64,${b64}` });
  } catch (err) {
    console.error('[image] error:', err?.name, err?.message);
    res.status(502).json({ error: err?.message || 'bedrock image error' });
  }
});

// ---- 静态站点（HTML / data / paytable 等）------------------------------------
app.use(express.static(SITE_ROOT, { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log('========================================');
  console.log(' AI Slots Tools 本地服务器已启动');
  console.log(` 首页:     http://localhost:${PORT}/`);
  console.log(` 配音配乐: http://localhost:${PORT}/voiceover/`);
  console.log(` 玩法文档: http://localhost:${PORT}/gameplay/`);
  console.log(` Paytable: http://localhost:${PORT}/paytable/`);
  console.log(` AI 后端:  Bedrock @ ${REGION}`);
  console.log(`   主模型: ${MODEL_PRIMARY}`);
  console.log(`   副模型: ${MODEL_SECONDARY}`);
  console.log('========================================');
});
