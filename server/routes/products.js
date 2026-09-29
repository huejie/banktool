import { Router } from 'express';
import { db } from '../db.js';

export const productsRouter = Router();

function normalize(body) {
  const name = String(body.name || '').trim();
  if (!name) {
    const err = new Error('产品名称不能为空');
    err.status = 400;
    throw err;
  }
  return {
    name,
    category: String(body.category || '理财').trim() || '理财',
    code: String(body.code || '').trim(),
    risk_level: String(body.risk_level || '').trim(),
    expected_rate: String(body.expected_rate || '').trim(),
    term: String(body.term || '').trim(),
    min_amount: Number(body.min_amount) || 0,
    highlights: String(body.highlights || '').trim(),
    notes: String(body.notes || '').trim(),
    is_active: body.is_active === false || body.is_active === 0 ? 0 : 1,
  };
}

productsRouter.get('/', (req, res) => {
  const { q = '', category = '', include_inactive = '' } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(name LIKE ? OR code LIKE ? OR highlights LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (include_inactive !== '1') {
    where.push('is_active = 1');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const list = db.prepare(`SELECT * FROM products ${whereSql} ORDER BY category, id DESC`).all(...params);
  res.json({ list });
});

productsRouter.post('/', (req, res) => {
  const data = normalize(req.body || {});
  const info = db
    .prepare(
      `INSERT INTO products (name, category, code, risk_level, expected_rate, term, min_amount, highlights, notes, is_active)
       VALUES (@name, @category, @code, @risk_level, @expected_rate, @term, @min_amount, @highlights, @notes, @is_active)`
    )
    .run(data);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

productsRouter.put('/:id', (req, res) => {
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: '产品不存在' });
  const data = normalize(req.body || {});
  db.prepare(
    `UPDATE products SET name=@name, category=@category, code=@code, risk_level=@risk_level, expected_rate=@expected_rate,
     term=@term, min_amount=@min_amount, highlights=@highlights, notes=@notes, is_active=@is_active WHERE id=@id`
  ).run({ ...data, id: Number(req.params.id) });
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(row);
});

productsRouter.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '产品不存在' });
  res.json({ ok: true });
});
