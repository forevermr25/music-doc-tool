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

// 文本模型：当前统一使用 Claude Opus 4.8。
// PRIMARY / SECONDARY 都指向同一模型；保留两个变量以便将来想做"双版本对比"时区分。
const MODEL_PRIMARY = process.env.CLAUDE_MODEL_PRIMARY || 'global.anthropic.claude-opus-4-8';
const MODEL_SECONDARY = process.env.CLAUDE_MODEL_SECONDARY || 'global.anthropic.claude-opus-4-8';
const IMAGE_MODEL = process.env.BEDROCK_IMAGE_MODEL || 'amazon.titan-image-generator-v2:0';
// 单次回复最大输出 token。钳制到安全区间，避免超过模型上限导致请求被拒。
const MAX_TOKENS_CAP = 64000; // Opus 4.8 输出上限为 128000，留足余量
let MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '8192', 10);
if (!Number.isFinite(MAX_TOKENS) || MAX_TOKENS < 256) MAX_TOKENS = 8192;
if (MAX_TOKENS > MAX_TOKENS_CAP) {
  console.warn(`[config] MAX_TOKENS=${MAX_TOKENS} 超过上限，已钳制为 ${MAX_TOKENS_CAP}`);
  MAX_TOKENS = MAX_TOKENS_CAP;
}

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

// 部分较新模型（如 Claude Opus 4.8）已弃用 temperature 参数，传了会报错。
function modelSupportsTemperature(modelId) {
  const m = String(modelId).toLowerCase();
  if (m.includes('opus-4-8')) return false;
  return true;
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
  const useTemp = modelSupportsTemperature(modelId);

  async function invoke(withTemp) {
    const inferenceConfig = { maxTokens: MAX_TOKENS };
    if (withTemp) {
      inferenceConfig.temperature = typeof temperature === 'number' ? temperature : 0.8;
    }
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      ...(system ? { system: [{ text: system }] } : {}),
      inferenceConfig,
    });
    return bedrock.send(cmd);
  }

  try {
    let out;
    try {
      out = await invoke(useTemp);
    } catch (e) {
      // 兜底：模型不接受 temperature 时去掉重试一次
      if (useTemp && /temperature/i.test(e?.message || '')) {
        out = await invoke(false);
      } else {
        throw e;
      }
    }
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
