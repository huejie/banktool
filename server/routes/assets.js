import { Router } from 'express';
import { db, inTransaction } from '../db.js';

export const assetsRouter = Router();

function normalize(body) {
  const customerId = Number(body.customer_id);
  if (!customerId || !db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId)) {
    const err = new Error('请先选择所属客户');
    err.status = 400;
    throw err;
  }
  return {
    customer_id: customerId,
    category: String(body.category || '其他').trim() || '其他',
    product_name: String(body.product_name || '').trim(),
    amount: Number(body.amount) || 0,
    start_date: String(body.start_date || '').trim(),
    maturity_date: String(body.maturity_date || '').trim(),
    rate: String(body.rate || '').trim(),
    notes: String(body.notes || '').trim(),
  };
}

function rowWithCustomer(row) {
  const c = db.prepare('SELECT name FROM customers WHERE id = ?').get(row.customer_id);
  return { ...row, customer_name: c ? c.name : '' };
}

// 列表：支持客户 / 类别 / 日期范围筛选
assetsRouter.get('/', (req, res) => {
  const { customer_id = '', category = '', from = '', to = '' } = req.query;
  const where = [];
  const params = [];
  if (customer_id) {
    where.push('a.customer_id = ?');
    params.push(Number(customer_id));
  }
  if (category) {
    where.push('a.category = ?');
    params.push(category);
  }
  // 空字符串日期天然不满足 >= 比较，无需额外排除；到期日为空表示无固定期限，按到期范围筛选时应排除
  if (from) {
    where.push("a.start_date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("a.maturity_date != '' AND a.maturity_date <= ?");
    params.push(to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT a.*, c.name AS customer_name
       FROM assets a JOIN customers c ON c.id = a.customer_id
       ${whereSql}
       ORDER BY a.record_date DESC, a.id DESC`
    )
    .all(...params);
  const byCategory = {};
  let total = 0;
  for (const r of rows) {
    total += r.amount;
    byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
  }
  res.json({ list: rows, total, by_category: byCategory });
});

// 新增（单条或批量：传 items 数组）
assetsRouter.post('/', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  if (!items.length) return res.status(400).json({ error: '没有要保存的记录' });
  const insert = db.prepare(
    `INSERT INTO assets (customer_id, category, product_name, amount, start_date, maturity_date, rate, notes)
     VALUES (@customer_id, @category, @product_name, @amount, @start_date, @maturity_date, @rate, @notes)`
  );
  const ids = inTransaction(() => items.map((it) => Number(insert.run(normalize(it)).lastInsertRowid)));
  res.status(201).json({ ok: true, ids });
});

assetsRouter.put('/:id', (req, res) => {
  const exists = db.prepare('SELECT id FROM assets WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: '记录不存在' });
  const data = normalize(req.body || {});
  db.prepare(
    `UPDATE assets SET customer_id=@customer_id, category=@category, product_name=@product_name, amount=@amount,
     start_date=@start_date, maturity_date=@maturity_date, rate=@rate, notes=@notes WHERE id=@id`
  ).run({ ...data, id: Number(req.params.id) });
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  res.json(rowWithCustomer(row));
});

assetsRouter.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '记录不存在' });
  res.json({ ok: true });
});
