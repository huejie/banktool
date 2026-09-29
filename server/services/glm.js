import { getSetting } from '../db.js';

export function glmConfig() {
  return {
    apiKey: getSetting('api_key', ''),
    baseUrl: getSetting('base_url', 'https://open.bigmodel.cn/api/paas/v4'),
    ocrModel: getSetting('ocr_model', 'glm-5.3-flash'),
    analysisModel: getSetting('analysis_model', 'glm-5.3-flash'),
  };
}

export async function chat({ model, messages, temperature = 0.3, maxTokens }) {
  const { apiKey, baseUrl } = glmConfig();
  if (!apiKey) {
    const err = new Error('尚未配置 API Key，请先到「设置」页填写智谱 API Key');
    err.status = 400;
    err.code = 'NO_API_KEY';
    throw err;
  }
  const body = { model, messages, temperature, stream: false };
  if (maxTokens) body.max_tokens = maxTokens;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`智谱接口错误 ${res.status}: ${text.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * 从模型回复中稳健地抽取 JSON（容忍 ```json 代码块、前后缀文本）。
 * 解析失败返回 null，由调用方决定回退为纯文本。
 */
export function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const starts = [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const closeCh = t[start] === '{' ? '}' : ']';
  const end = t.lastIndexOf(closeCh);
  if (end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * 流式对话：返回已校验的 fetch Response，由调用方逐块读取 res.body
 * （SSE data: 行，choices[0].delta.content 为增量文本）。
 */
export async function chatStream({ model, messages, temperature = 0.5 }) {
  const { apiKey, baseUrl } = glmConfig();
  if (!apiKey) {
    const err = new Error('尚未配置 API Key，请先到「设置」页填写智谱 API Key');
    err.status = 400;
    err.code = 'NO_API_KEY';
    throw err;
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature, stream: true }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`智谱接口错误 ${res.status}: ${text.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  return res;
}
