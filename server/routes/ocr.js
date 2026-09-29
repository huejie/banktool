import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, UPLOAD_DIR } from '../db.js';
import { chat, extractJson, glmConfig } from '../services/glm.js';

export const ocrRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只支持图片文件'));
  },
});

const CARD_PROMPT = `你是专业的 OCR 信息提取助手。请仔细识别这张名片/客户资料图片，提取以下字段，严格输出一个 JSON 对象：
{"name":"姓名","phone":"电话(多个用逗号分隔)","company":"单位","title":"职务","email":"邮箱","address":"地址","extra":"其他值得记录的信息"}
要求：无法识别或图片中不存在的字段填空字符串 ""。只输出 JSON，不要输出任何其他文字或代码块标记。`;

function templatePrompt(fields) {
  return `你是专业的 OCR 信息提取助手。请仔细识别图片内容，按给定字段名提取对应的值。
字段列表：${fields.join('、')}
严格输出一个 JSON 对象，键为上面的字段名，值为识别出的内容；图片中找不到的字段填空字符串 ""。
只输出 JSON，不要输出任何其他文字或代码块标记。`;
}

const ASSETS_PROMPT = `你是专业的 OCR 表格提取助手。请仔细识别图片中的资产/持仓/流水/产品列表等表格信息，逐行提取为 JSON 数组。
每行格式：
{"category":"类别","product_name":"产品名称","amount":0,"start_date":"YYYY-MM-DD","maturity_date":"YYYY-MM-DD","rate":"参考利率","notes":"备注"}
要求：
- category 必须从以下选项中选择最贴近的一个：存款、理财、基金、保险、信托、贵金属、其他
- amount 为数字（去掉千分位逗号、货币符号），识别不出填 0
- 日期统一为 YYYY-MM-DD 格式，识别不出填 ""
- rate 保留原文（如 "3.25%" 或 "2.1%-2.8%"）
- 只输出 JSON 数组，没有数据行时输出 []`;

// 上传识别：multipart 表单（image 文件 + mode + fields）
ocrRouter.post('/', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择要识别的图片' });
    const mode = String(req.body.mode || 'card');
    let prompt;
    if (mode === 'template') {
      const fields = String(req.body.fields || '')
        .split(/[\n,，、]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!fields.length) return res.status(400).json({ error: '通用识别模式需要先填写要提取的字段' });
      prompt = templatePrompt(fields);
    } else if (mode === 'assets') {
      prompt = ASSETS_PROMPT;
    } else {
      prompt = CARD_PROMPT;
    }

    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const raw = await chat({
      model: glmConfig().ocrModel,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const parsed = extractJson(raw);
    let result;
    if (mode === 'assets') {
      result = Array.isArray(parsed) ? parsed : [];
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      result = parsed;
    } else {
      result = null;
    }

    // 图片落盘，便于历史回看
    const ext = (path.extname(req.file.originalname) || `.${req.file.mimetype.split('/')[1] || 'jpg'}`).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic'].includes(ext) ? ext : '.jpg';
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);

    const info = db
      .prepare('INSERT INTO ocr_records (image_path, mode, result) VALUES (?, ?, ?)')
      .run(`/uploads/${filename}`, mode, JSON.stringify({ result, raw: raw.slice(0, 8000) }));
    res.json({ id: info.lastInsertRowid, mode, image: `/uploads/${filename}`, result, raw });
  } catch (e) {
    next(e);
  }
});

// 识别历史
ocrRouter.get('/records', (_req, res) => {
  const rows = db
    .prepare('SELECT id, image_path, mode, result, created_at FROM ocr_records ORDER BY id DESC LIMIT 100')
    .all();
  res.json({
    list: rows.map((r) => {
      let parsed = null;
      try {
        parsed = JSON.parse(r.result || 'null');
      } catch {}
      return { ...r, result: parsed?.result ?? null, raw: parsed?.raw ?? '' };
    }),
  });
});

ocrRouter.delete('/records/:id', (req, res) => {
  const row = db.prepare('SELECT image_path FROM ocr_records WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  db.prepare('DELETE FROM ocr_records WHERE id = ?').run(req.params.id);
  const file = path.join(UPLOAD_DIR, path.basename(row.image_path || ''));
  if (row.image_path && fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});
