import { Router } from 'express';
import { db } from '../db.js';

export const customersRouter = Router();

function parseRow(row) {
  if (!row) return row;
  let tags = [];
  try {
    tags = JSON.parse(row.tags || '[]');
    if (!Array.isArray(tags)) tags = [];
  } catch {
    tags = [];
  }
  const { tags: _t, ...rest } = row;
  return { ...rest, tags };
}

function validateAndNormalize(body) {
  const name = String(body.name || '').trim();
  if (!name) {
    const err = new Error('客户姓名不能为空');
    err.status = 400;
    throw err;
  }
  const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  return {
    name,
    phone: String(body.phone || '').trim(),
    gender: String(body.gender || '').trim(),
    birthday: String(body.birthday || '').trim(),
    company: String(body.company || '').trim(),
    title: String(body.title || '').trim(),
    risk_level: String(body.risk_level || '').trim(),
    tags: JSON.stringify(tags),
    preferences: String(body.preferences || '').trim(),
    notes: String(body.notes || '').trim(),
  };
}

// 列表：支持关键字 / 标签 / 风险等级筛选，附带资产合计
customersRouter.get('/', (req, res) => {
  const { q = '', tag = '', risk = '' } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.company LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (tag) {
    where.push('c.tags LIKE ?');
    params.push(`%"${tag}"%`);
  }
  if (risk) {
    where.push('c.risk_level = ?');
    params.push(risk);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT c.*, COALESCE(SUM(a.amount), 0) AS total_assets, COUNT(a.id) AS asset_count
       FROM customers c LEFT JOIN assets a ON a.customer_id = c.id
       ${whereSql}
       GROUP BY c.id
       ORDER BY c.updated_at DESC`
    )
    .all(...params);
  const total = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM assets')
    .get().t;
  res.json({ list: rows.map(parseRow), total_assets: total });
});

customersRouter.post('/', (req, res) => {
  const data = validateAndNormalize(req.body || {});
  const info = db
    .prepare(
      `INSERT INTO customers (name, phone, gender, birthday, company, title, risk_level, tags, preferences, notes)
       VALUES (@name, @phone, @gender, @birthday, @company, @title, @risk_level, @tags, @preferences, @notes)`
    )
    .run(data);
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(parseRow(row));
});

customersRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '客户不存在' });
  const assets = db
    .prepare('SELECT * FROM assets WHERE customer_id = ? ORDER BY record_date DESC, id DESC')
    .all(row.id);
  const analyses = db
    .prepare('SELECT * FROM analysis_records WHERE customer_id = ? ORDER BY created_at DESC, id DESC')
    .all(row.id);
  res.json({ ...parseRow(row), assets, analyses });
});

customersRouter.put('/:id', (req, res) => {
  const exists = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: '客户不存在' });
  const data = validateAndNormalize(req.body || {});
  db.prepare(
    `UPDATE customers SET name=@name, phone=@phone, gender=@gender, birthday=@birthday, company=@company,
     title=@title, risk_level=@risk_level, tags=@tags, preferences=@preferences, notes=@notes,
     updated_at=datetime('now','localtime') WHERE id=@id`
  ).run({ ...data, id: Number(req.params.id) });
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  res.json(parseRow(row));
});

customersRouter.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '客户不存在' });
  res.json({ ok: true });
});
