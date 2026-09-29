import { Router } from 'express';
import { getSetting, setSetting } from '../db.js';
import { chat, glmConfig } from '../services/glm.js';

export const settingsRouter = Router();

function maskKey(key) {
  if (!key) return '';
  if (key.length <= 10) return '****';
  return `${key.slice(0, 6)}****${key.slice(-4)}`;
}

settingsRouter.get('/', (_req, res) => {
  const { apiKey, baseUrl, ocrModel, analysisModel } = glmConfig();
  res.json({
    has_api_key: Boolean(apiKey),
    api_key_masked: maskKey(apiKey),
    base_url: baseUrl,
    ocr_model: ocrModel,
    analysis_model: analysisModel,
    mask_enabled: getSetting('mask_enabled', '1') === '1',
  });
});

settingsRouter.put('/', (req, res) => {
  const body = req.body || {};
  if (typeof body.api_key === 'string' && body.api_key.trim()) {
    setSetting('api_key', body.api_key.trim());
  }
  if (typeof body.base_url === 'string' && body.base_url.trim()) {
    setSetting('base_url', body.base_url.trim());
  }
  if (typeof body.ocr_model === 'string' && body.ocr_model.trim()) {
    setSetting('ocr_model', body.ocr_model.trim());
  }
  if (typeof body.analysis_model === 'string' && body.analysis_model.trim()) {
    setSetting('analysis_model', body.analysis_model.trim());
  }
  if (typeof body.mask_enabled === 'boolean') {
    setSetting('mask_enabled', body.mask_enabled ? '1' : '0');
  }
  res.json({ ok: true });
});

// 连通性测试：发一条最小请求（GLM-5.3 为推理模型，思考会消耗输出额度，maxTokens 需给足）
settingsRouter.post('/test', async (_req, res, next) => {
  try {
    const reply = await chat({
      model: glmConfig().analysisModel,
      temperature: 0,
      maxTokens: 256,
      messages: [{ role: 'user', content: '直接回复两个字母：ok' }],
    });
    const text = String(reply).trim().slice(0, 50);
    res.json({ ok: true, reply: text || '模型已响应' });
  } catch (e) {
    next(e);
  }
});
