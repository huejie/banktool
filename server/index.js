import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIR } from './db.js';
import { customersRouter } from './routes/customers.js';
import { assetsRouter } from './routes/assets.js';
import { ocrRouter } from './routes/ocr.js';
import { analysisRouter } from './routes/analysis.js';
import { settingsRouter } from './routes/settings.js';
import { chatRouter } from './routes/chat.js';
import { productsRouter } from './routes/products.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/customers', customersRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/products', productsRouter);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));

// 生产模式：托管前端构建产物（SPA 回退到 index.html）
const distDir = path.resolve(__dirname, '../web/dist');
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      maxAge: '30d',
      setHeaders: (res, filePath) => {
        // html 不缓存，避免发版后手机端拿到旧页面；带哈希的资源长缓存
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// 统一错误响应
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || '服务器内部错误' });
});

const PORT = Number(process.env.PORT || 3010);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`[bank-tool] http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
