import { Router } from 'express';
import { db } from '../db.js';
import { chat, chatStream, extractJson, glmConfig } from '../services/glm.js';

export const chatRouter = Router();

const CHAT_SYSTEM_PROMPT = `你是银行客户经理的对话助手「客户簿」，运行在客户经理自己的私人工具里。你的职责：
- 口述整理：客户经理口头/文字描述拜访情况、客户信息时，帮忙整理成结构化要点；系统会自动识别消息中的生日、偏好、资产以及产品信息，用户可在 AI 回答下方点「存入档案 / 存入产品库」一键入库——识别到这类信息时简要确认你理解的要点即可
- 客户问答：基于给定的客户库摘要回答关于其客户的问题
- 营销支持（强项）：随时可以生成拿来就能用的营销话术——用户说"给我一段到期承接话术""胡杰的产品快到期了怎么聊"，就按 SPIN 提问法/FABE 结构输出口语化话术，标注适用渠道（电话/微信/面谈），并附常见异议应对；不承诺收益、必要处提示风险
- 业务参考：理财配置、营销沟通方向的建议（只做方向性参考，注意合规表述）
风格：口语化、简洁、实用，少用长篇大论。不确定就说不知道，不编造客户数据。回复用简体中文 Markdown。`;

function customerRoster(limit = 60) {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.risk_level, c.tags, COALESCE(SUM(a.amount), 0) AS total
       FROM customers c LEFT JOIN assets a ON a.customer_id = c.id
       GROUP BY c.id ORDER BY total DESC, c.updated_at DESC LIMIT ?`
    )
    .all(limit);
  return rows.map((r) => {
    let tags = [];
    try {
      tags = JSON.parse(r.tags || '[]');
    } catch {}
    return { id: r.id, name: r.name, risk: r.risk_level || '', total: Math.round(r.total), tags };
  });
}

function rosterText(list) {
  if (!list.length) return '（客户库为空）';
  return list
    .map((c) => `- #${c.id} ${c.name}${c.risk ? `｜${c.risk}` : ''}${c.total ? `｜资产约${c.total}元` : ''}${c.tags.length ? `｜${c.tags.join('、')}` : ''}`)
    .join('\n');
}

/**
 * AI 分析用户消息：匹配谈到哪位客户 + 抽取可入库的结构化信息（生日/偏好/资产）。
 * 一次调用完成，返回 { customer_id?, new_name?, info? }
 */
async function analyzeMessage(content) {
  const roster = customerRoster();
  const prompt = `客户名单（#id 姓名）：
${rosterText(roster)}

用户消息：「${content}」

请分析这条消息，严格输出一个 JSON 对象：
{
  "customer_id": 匹配到名单中的客户则填其数字 id，否则 null,
  "new_name": 消息明确提到的、不在名单中的客户/联系人姓名（语境是建档对象，而非泛指），否则 null,
  "info": {
    "birthday": "生日，尽量 YYYY-MM-DD，没有年份可用 MM-DD，识别不出为空串",
    "preferences": "口味偏好/兴趣爱好/沟通习惯等简洁描述短语，没有为空串",
    "tags": ["从内容提炼的偏好标签词（2-4字），如 美食、黄金、钓鱼，没有为空数组"],
    "assets": [{"category": "存款/理财/基金/保险/信托/贵金属/其他 之一", "product_name": "产品名（如有，否则空串）", "amount": 金额数字（换算为元，如 1500万=15000000，未提金额为 0）, "notes": "补充说明（如有，否则空串）"}]
  },
  "product": 仅当消息明确在登记/介绍一款在售产品（如"新增产品/录个产品/我们行有个XX"）时提取：{"name":"产品名","category":"存款/理财/基金/保险/信托/贵金属/其他 之一","risk_level":"风险等级（如 R2 稳健型）","expected_rate":"利率/业绩基准原文","term":"期限（如 90天）","min_amount":起购金额数字（元，没有为0）,"highlights":"一句话卖点","notes":"备注"}，否则省略整个 product 字段
}
要求：assets 仅在消息明确提到资金/持仓/购买时才给；产品信息与客户资产不同——说"买了500万基金"填 assets，说"新增一个基金产品"填 product；闲聊或提问类消息 info 各字段留空、assets 为空数组。只输出 JSON，不要其他内容。`;

  const reply = await chat({
    model: glmConfig().analysisModel,
    temperature: 0,
    maxTokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });
  const parsed = extractJson(reply);
  if (!parsed || typeof parsed !== 'object') return null;
  const out = {};
  if (parsed.customer_id && roster.some((c) => c.id === Number(parsed.customer_id))) {
    out.customer_id = Number(parsed.customer_id);
  }
  if (typeof parsed.new_name === 'string' && parsed.new_name.trim()) {
    out.new_name = parsed.new_name.trim().slice(0, 30);
  }
  const rawInfo = parsed.info && typeof parsed.info === 'object' ? parsed.info : {};
  const info = {};
  if (typeof rawInfo.birthday === 'string' && rawInfo.birthday.trim()) info.birthday = rawInfo.birthday.trim().slice(0, 20);
  if (typeof rawInfo.preferences === 'string' && rawInfo.preferences.trim()) info.preferences = rawInfo.preferences.trim().slice(0, 200);
  if (Array.isArray(rawInfo.tags)) {
    const tags = rawInfo.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
    if (tags.length) info.tags = tags;
  }
  if (Array.isArray(rawInfo.assets)) {
    const assets = rawInfo.assets
      .map((a) => ({
        category: ['存款', '理财', '基金', '保险', '信托', '贵金属', '其他'].includes(a?.category) ? a.category : '其他',
        product_name: String(a?.product_name || '').trim().slice(0, 60),
        amount: Number(a?.amount) || 0,
        notes: String(a?.notes || '').trim().slice(0, 100),
      }))
      .filter((a) => a.amount > 0 || a.product_name);
    if (assets.length) info.assets = assets;
  }
  if (Object.keys(info).length) out.info = info;
  // 产品要素抽取（新增产品语境）
  const rawP = parsed.product;
  if (rawP && typeof rawP === 'object' && String(rawP.name || '').trim()) {
    const cats = ['存款', '理财', '基金', '保险', '信托', '贵金属', '其他'];
    out.product = {
      name: String(rawP.name).trim().slice(0, 60),
      category: cats.includes(rawP.category) ? rawP.category : '其他',
      risk_level: String(rawP.risk_level || '').trim().slice(0, 20),
      expected_rate: String(rawP.expected_rate || '').trim().slice(0, 30),
      term: String(rawP.term || '').trim().slice(0, 30),
      min_amount: Number(rawP.min_amount) || 0,
      highlights: String(rawP.highlights || '').trim().slice(0, 120),
      notes: String(rawP.notes || '').trim().slice(0, 100),
    };
  }
  return Object.keys(out).length ? out : null;
}

function withCustomerName(row) {
  if (!row) return row;
  const { extracted, ...rest } = row;
  let parsedExtracted = null;
  if (extracted) {
    try {
      parsedExtracted = JSON.parse(extracted);
    } catch {}
  }
  const out = { ...rest, extracted: parsedExtracted };
  if (row.customer_id) {
    const c = db.prepare('SELECT name FROM customers WHERE id = ?').get(row.customer_id);
    out.customer_name = c ? c.name : null;
  } else {
    out.customer_name = null;
  }
  return out;
}

// 历史消息（可按客户过滤）
chatRouter.get('/messages', (req, res) => {
  const { customer_id = '', limit = 200 } = req.query;
  const rows = customer_id
    ? db
        .prepare('SELECT * FROM chat_messages WHERE customer_id = ? ORDER BY id DESC LIMIT ?')
        .all(Number(customer_id), Number(limit))
        .reverse()
    : db.prepare('SELECT * FROM chat_messages ORDER BY id DESC LIMIT ?').all(Number(limit)).reverse();
  res.json({ list: rows.map(withCustomerName) });
});

// 发送消息 → SSE 流式回复
chatRouter.post('/send', async (req, res) => {
  const body = req.body || {};
  const content = String(body.content || '').trim();
  if (!content) return res.status(400).json({ error: '消息不能为空' });

  let customerId = body.customer_id ? Number(body.customer_id) : null;
  let suggestNew = '';
  let extractedInfo = null;
  let meta = {};

  try {
    // 始终执行 AI 分析：未指定客户时做归属匹配；结构化信息（生日/偏好/资产）任何模式都要抽取
    const m = await analyzeMessage(content);
    if (!customerId) {
      if (m?.customer_id) {
        customerId = m.customer_id;
        const c = db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId);
        meta.matched_customer = { id: customerId, name: c?.name || '' };
      } else if (m?.new_name) {
        suggestNew = m.new_name;
        meta.suggest_new = m.new_name;
      }
    }
    if (m?.info || m?.product) {
      const ext = {};
      if (m.info) ext.info = m.info;
      if (m.product) ext.product = m.product;
      extractedInfo = ext;
      meta.extracted = ext;
    }
  } catch (e) {
    // 匹配失败不阻塞对话，按无归属继续
    meta.match_error = e.message;
  }

  const info = db
    .prepare('INSERT INTO chat_messages (customer_id, role, content, suggest_new, extracted) VALUES (?, ?, ?, ?, ?)')
    .run(customerId, 'user', content, suggestNew, extractedInfo ? JSON.stringify(extractedInfo) : '');
  const userMsgId = Number(info.lastInsertRowid);

  // 组装对话上下文
  const history = db
    .prepare('SELECT role, content FROM chat_messages ORDER BY id DESC LIMIT 21')
    .all()
    .reverse();
  const chatHistory = history.slice(0, -1); // 去掉刚插入的本条（下面单独放最后）
  const roster = customerRoster();
  let contextBlock = `【客户库摘要】(共${roster.length}位)\n${rosterText(roster)}`;
  const products = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY category, id DESC').all();
  if (products.length) {
    contextBlock += `\n\n【在售产品库】（用户要产品推荐时从中选择，注意风险等级与客户匹配）\n${products
      .map((p) => `- ${p.name}｜${p.category}｜${p.risk_level || '风险未标'}${p.expected_rate ? `｜基准${p.expected_rate}` : ''}${p.term ? `｜${p.term}` : ''}${p.min_amount ? `｜${p.min_amount}元起` : ''}${p.highlights ? `｜${p.highlights}` : ''}`)
      .join('\n')}`;
  }
  if (customerId) {
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (c) {
      let tags = [];
      try {
        tags = JSON.parse(c.tags || '[]');
      } catch {}
      const assets = db.prepare('SELECT category, product_name, amount FROM assets WHERE customer_id = ? ORDER BY amount DESC LIMIT 20').all(customerId);
      contextBlock += `\n\n【当前关联客户详情】#${c.id} ${c.name}｜${c.risk_level || '风险等级未知'}｜偏好：${[...tags, c.preferences].filter(Boolean).join('；') || '无'}\n资产：${
        assets.length ? assets.map((a) => `${a.category}-${a.product_name || '未命名'}(${a.amount}元)`).join('、') : '无记录'
      }`;
    }
  }

  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    { role: 'system', content: contextBlock },
    ...chatHistory,
    { role: 'user', content },
  ];

  // SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  try {
    send({ meta: { ...meta, user_message_id: userMsgId } });
    const upstream = await chatStream({ model: glmConfig().analysisModel, messages });
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            send({ delta });
          }
        } catch {}
      }
    }
    if (!full) {
      full = '（AI 未返回内容，请稍后重试）';
      send({ delta: full });
    }
    const aInfo = db
      .prepare("INSERT INTO chat_messages (customer_id, role, content) VALUES (?, 'assistant', ?)")
      .run(customerId, full);
    send({ done: true, message_id: Number(aInfo.lastInsertRowid), customer_id: customerId });
  } catch (e) {
    send({ error: e.message || 'AI 调用失败' });
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// 归档/转移归属（新建客户后前端回调）
chatRouter.put('/messages/:id/assign', (req, res) => {
  const row = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '消息不存在' });
  const { customer_id } = req.body || {};
  if (!customer_id || !db.prepare('SELECT id FROM customers WHERE id = ?').get(Number(customer_id))) {
    return res.status(400).json({ error: '目标客户不存在' });
  }
  db.prepare('UPDATE chat_messages SET customer_id = ?, suggest_new = ? WHERE id = ?').run(Number(customer_id), '', req.params.id);
  // 同一条 user 消息后面紧邻的 assistant 回复一并归档，保持记录完整
  db.prepare(
    "UPDATE chat_messages SET customer_id = ? WHERE id = (SELECT id FROM chat_messages WHERE role='assistant' AND id > ? ORDER BY id LIMIT 1)"
  ).run(Number(customer_id), Number(req.params.id));
  res.json(withCustomerName(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(req.params.id)));
});

// 存入档案 / 产品库：把消息中抽取的结构化信息落库
// body: { message_id, customer_id?, info?（客户资料+资产）, product?（产品入库，无需客户） }
chatRouter.post('/apply', (req, res) => {
  const body = req.body || {};
  const msg = db.prepare("SELECT * FROM chat_messages WHERE id = ? AND role = 'user'").get(Number(body.message_id));
  if (!msg) return res.status(404).json({ error: '消息不存在' });

  // 产品入库分支
  const product = body.product;
  if (product && String(product.name || '').trim()) {
    const cats = ['存款', '理财', '基金', '保险', '信托', '贵金属', '其他'];
    const info2 = db
      .prepare(
        `INSERT INTO products (name, category, code, risk_level, expected_rate, term, min_amount, highlights, notes, is_active)
         VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        String(product.name).trim().slice(0, 60),
        cats.includes(product.category) ? product.category : '其他',
        String(product.risk_level || '').trim().slice(0, 20),
        String(product.expected_rate || '').trim().slice(0, 30),
        String(product.term || '').trim().slice(0, 30),
        Number(product.min_amount) || 0,
        String(product.highlights || '').trim().slice(0, 120),
        String(product.notes || '').trim().slice(0, 100)
      );
    const customerId = Number(body.customer_id) || null;
    db.prepare('UPDATE chat_messages SET customer_id = COALESCE(?, customer_id), suggest_new = ?, applied = 1 WHERE id = ?').run(customerId, '', msg.id);
    if (customerId) {
      db.prepare(
        "UPDATE chat_messages SET customer_id = ? WHERE id = (SELECT id FROM chat_messages WHERE role='assistant' AND id > ? ORDER BY id LIMIT 1)"
      ).run(customerId, msg.id);
    }
    const row = db.prepare('SELECT name FROM products WHERE id = ?').get(info2.lastInsertRowid);
    return res.json({ ok: true, product_name: row.name, summary: '已存入产品库', assets_added: 0 });
  }

  const customerId = Number(body.customer_id);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return res.status(400).json({ error: '目标客户不存在' });

  const info = body.info || {};
  const summary = [];

  const updates = {};
  if (info.birthday && !customer.birthday) {
    updates.birthday = String(info.birthday).slice(0, 20);
    summary.push(`生日 ${updates.birthday}`);
  }
  if (info.preferences) {
    const merged = [customer.preferences, info.preferences].filter(Boolean).join('；');
    updates.preferences = merged.slice(0, 500);
    summary.push('偏好描述');
  }
  let tags = [];
  try {
    tags = JSON.parse(customer.tags || '[]');
  } catch {}
  if (Array.isArray(info.tags) && info.tags.length) {
    const set = new Set([...tags, ...info.tags.map((t) => String(t).trim()).filter(Boolean)]);
    tags = [...set].slice(0, 15);
    updates.tags = JSON.stringify(tags);
    summary.push(`标签 ${info.tags.join('、')}`);
  }
  if (Object.keys(updates).length) {
    const fields = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE customers SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run({ ...updates, id: customerId });
  }

  let assetsAdded = 0;
  if (Array.isArray(info.assets)) {
    const insert = db.prepare(
      `INSERT INTO assets (customer_id, category, product_name, amount, notes) VALUES (?, ?, ?, ?, ?)`
    );
    const valid = info.assets.filter((a) => a && (Number(a.amount) > 0 || String(a.product_name || '').trim()));
    for (const a of valid) {
      insert.run(customerId, a.category || '其他', String(a.product_name || '').trim(), Number(a.amount) || 0, String(a.notes || '').trim());
      assetsAdded++;
    }
    if (assetsAdded) summary.push(`${assetsAdded} 笔资产`);
  }

  // 消息标记已应用并归档到该客户
  db.prepare('UPDATE chat_messages SET customer_id = ?, suggest_new = ?, applied = 1 WHERE id = ?').run(customerId, '', msg.id);
  db.prepare(
    "UPDATE chat_messages SET customer_id = ? WHERE id = (SELECT id FROM chat_messages WHERE role='assistant' AND id > ? ORDER BY id LIMIT 1)"
  ).run(customerId, msg.id);

  res.json({ ok: true, customer_name: customer.name, summary: summary.join('，'), assets_added: assetsAdded });
});

chatRouter.delete('/messages/:id', (req, res) => {
  const info = db.prepare('DELETE FROM chat_messages WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '消息不存在' });
  res.json({ ok: true });
});

chatRouter.delete('/messages', (req, res) => {
  if (req.query.all !== '1') return res.status(400).json({ error: '缺少 all=1 确认参数' });
  db.prepare('DELETE FROM chat_messages').run();
  res.json({ ok: true });
});
