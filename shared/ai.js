// =============================================================================
// 前端 AI 客户端（统一入口）
// 旧实现走 puter.ai.chat（浏览器直连）。现已改为调用本地后端代理 -> AWS Bedrock。
// 各页面只需引入本文件，并直接调用全局 callAI(prompt, model) / callAIImage(prompt, size)。
// 签名与旧版保持一致，调用点无需改动。
// =============================================================================
(function (global) {
  // 默认同源（由 server/server.js 同端口托管站点+接口）。
  // 如需指向别的后端，在引入本脚本前设置 window.AI_PROXY_BASE = 'http://host:port'。
  var BASE = (global.AI_PROXY_BASE || '').replace(/\/$/, '');

  async function postJSON(path, payload) {
    var resp = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      var msg = 'AI 服务错误 (' + resp.status + ')';
      try {
        var e = await resp.json();
        if (e && e.error) msg += ': ' + e.error;
      } catch (_) {}
      if (resp.status === 0 || resp.status >= 500) {
        msg += '\n\n请确认本地服务器已启动：\n  cd server && npm install && npm start\n然后通过 http://localhost:8080 访问页面。';
      }
      throw new Error(msg);
    }
    return resp.json();
  }

  // 文本生成。返回纯字符串，等价于旧的 callAI。
  async function callAI(prompt, model, opts) {
    opts = opts || {};
    var data = await postJSON('/api/ai/chat', {
      prompt: prompt,
      model: model,
      temperature: typeof opts.temperature === 'number' ? opts.temperature : undefined,
      system: opts.system,
    });
    return (data && typeof data.text === 'string') ? data.text : String(data && data.text);
  }

  // 图片生成。返回 data URL 字符串，等价于旧的 callAIImage。
  async function callAIImage(prompt, size) {
    var w = 1024, h = 1024;
    if (typeof size === 'string' && size.indexOf('x') > 0) {
      var parts = size.split('x');
      w = parseInt(parts[0], 10) || 1024;
      h = parseInt(parts[1], 10) || 1024;
    }
    var data = await postJSON('/api/ai/image', { prompt: prompt, width: w, height: h });
    return data.dataUrl;
  }

  global.callAI = callAI;
  global.callAIImage = callAIImage;
})(window);
