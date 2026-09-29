import { Router } from 'express';
import { db, getSetting } from '../db.js';
import { chat, glmConfig } from '../services/glm.js';
import { maskCustomer } from '../utils/mask.js';

export const analysisRouter = Router();

const TYPE_LABEL = {
  profile: '客户偏好画像',
  allocation: '资产配置分析',
  marketing: '营销作战卡',
  portfolio: '客群营销作战卡',
  radar: '客户雷达',
};

const SYSTEM_PROMPT = `你是一名资深银行财富顾问兼营销教练，服务对象是银行客户经理（理财经理），你的强项是把客户数据转化为**可执行的营销动作和拿来就能说的话术**。

分析方法论（在分析中自然运用，不要罗列术语）：
- KYC/KYP 双适配：客户风险等级与持仓产品风险属性匹配检查，错配即商机（保守客户重存款=升配机会，激进客户重权益=注意风险匹配）
- 到期承接：产品到期前 3-7 天是黄金触达窗口，围绕"资金安排"自然切入而不是推销
- 事件营销：生日、节假日、市场波动都是自然的触达由头
- SPIN 提问法：背景问题 → 难点问题 → 暗示问题 → 需求-效益问题，层层递进挖需求
- FABE 话术结构：产品特征 → 优势 → 对客户的具体利益 → 信任证据

话术硬要求：
- 口语化、自然，像熟人聊天；禁止"您好，我行近期推出"这类推销腔
- 每段话术标注适用渠道（电话 / 微信 / 面谈）
- 必须提供异议应对（如"我再想想""收益不高""最近要用钱"）
- 合规红线：不承诺收益、不贬低他行、必要处提示风险，用"历史业绩不代表未来表现"等规范表述

输出要求：
- 使用简体中文，结构清晰的 Markdown（二级/三级标题、要点列表，关键数字加粗）
- 结论必须基于给定数据，不编造；【营销信号】部分是系统计算的硬数据，优先引用
- 报告末尾单独一行输出：> 本报告由 AI 生成，仅供参考，话术使用前请结合合规要求调整`;

/** 服务端计算营销信号（硬数据，喂给 AI 引用） */
function marketingSignals(customer, assets) {
  const now = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const inDays = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
  const signals = [];

  // 到期窗口（30/90 天）
  const due30 = [];
  const due90 = [];
  for (const a of assets) {
    if (!a.maturity_date) continue;
    const m = String(a.maturity_date).slice(0, 10);
    if (m >= fmt(now) && m <= fmt(inDays(30))) due30.push(a);
    else if (m > fmt(inDays(30)) && m <= fmt(inDays(90))) due90.push(a);
  }
  if (due30.length) {
    signals.push(`⚠️ 未来30天到期（黄金承接窗口，优先跟进）：${due30.map((a) => `${a.product_name || a.category} ${fmtAmount(a.amount)}元(${a.maturity_date})`).join('、')}`);
  }
  if (due90.length) {
    const sum = due90.reduce((t, a) => t + a.amount, 0);
    signals.push(`未来31-90天到期：${due90.length}笔共 ${fmtAmount(sum)} 元（提前规划承接）`);
  }

  // 闲置资金：无到期日的存款
  const idle = assets.filter((a) => a.category === '存款' && !a.maturity_date);
  const idleSum = idle.reduce((t, a) => t + (a.amount || 0), 0);
  if (idleSum > 0) {
    signals.push(`疑似闲置/活期资金 ${fmtAmount(idleSum)} 元（无期限存款，可关注资金站岗）`);
  }

  // 持仓集中度
  const total = assets.reduce((t, a) => t + (a.amount || 0), 0);
  if (total > 0) {
    const byCat = {};
    for (const a of assets) byCat[a.category] = (byCat[a.category] || 0) + (a.amount || 0);
    const top = Object.entries(byCat).sort((x, y) => y[1] - x[1])[0];
    const pct = Math.round((top[1] / total) * 100);
    if (pct >= 70) signals.push(`持仓集中：${top[0]}占比 ${pct}%（结构单一，配置再平衡机会）`);
  }

  // 生日临近（30 天内）
  const bd = String(customer?.birthday || '').match(/(\d{1,2})[-/月](\d{1,2})/);
  if (bd) {
    const thisYear = new Date(now.getFullYear(), Number(bd[1]) - 1, Number(bd[2]));
    const target = thisYear < new Date(now.getFullYear(), now.getMonth(), now.getDate())
      ? new Date(now.getFullYear() + 1, Number(bd[1]) - 1, Number(bd[2]))
      : thisYear;
    const days = Math.ceil((target - now) / 86400000);
    if (days <= 30) signals.push(`🎂 生日临近：${target.getMonth() + 1}月${target.getDate()}日（还有 ${days} 天，事件营销由头）`);
  }

  return signals.length ? signals.join('\n') : '（暂无明显营销触发信号，可从偏好标签和关系维护切入）';
}

function fmtAmount(n) {
  return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function customerBlock(c, assets) {
  const lines = [
    `- 称呼：${c.name}`,
    c.phone ? `- 电话：${c.phone}` : '',
    c.gender ? `- 性别：${c.gender}` : '',
    c.birthday ? `- 生日：${c.birthday}` : '',
    c.company || c.title ? `- 单位/职务：${[c.company, c.title].filter(Boolean).join(' · ')}` : '',
    c.risk_level ? `- 风险等级：${c.risk_level}` : '',
    Array.isArray(c.tags) && c.tags.length ? `- 偏好标签：${c.tags.join('、')}` : '',
    c.preferences ? `- 偏好描述：${c.preferences}` : '',
    c.notes ? `- 备注：${c.notes}` : '',
  ].filter(Boolean);
  let s = lines.join('\n');
  if (assets && assets.length) {
    const total = assets.reduce((t, a) => t + (a.amount || 0), 0);
    s += `\n- 总资产：${fmtAmount(total)} 元，共 ${assets.length} 笔：`;
    for (const a of assets) {
      s += `\n  · ${a.category}｜${a.product_name || '未命名产品'}｜${fmtAmount(a.amount)} 元` +
        `${a.rate ? `｜利率 ${a.rate}` : ''}${a.start_date ? `｜起 ${a.start_date}` : ''}${a.maturity_date ? `｜到期 ${a.maturity_date}` : ''}`;
    }
  } else {
    s += '\n- 暂无资产记录';
  }
  return s;
}

/** 雷达扫描：全库摘要（数据完整度/最近沟通/信号）+ 转介绍线索 */
function radarScanText(customerRows) {
  const lastChats = {};
  for (const r of db
    .prepare("SELECT customer_id, MAX(created_at) AS t FROM chat_messages WHERE role='user' AND customer_id IS NOT NULL GROUP BY customer_id")
    .all()) {
    lastChats[r.customer_id] = r.t;
  }
  const lines = customerRows.map((r) => {
    const c = r.customer;
    const total = r.assets.reduce((t, a) => t + (a.amount || 0), 0);
    const missing = [];
    if (!c.phone) missing.push('电话');
    if (!c.birthday) missing.push('生日');
    if (!c.preferences && !(c.tags || []).length) missing.push('偏好');
    const last = lastChats[c.id];
    const relation = last ? `最近沟通 ${String(last).slice(5, 16)}` : '从未沟通';
    // 信号摘要
    const sig = [];
    const due30 = r.assets.filter((a) => a.maturity_date && a.maturity_date >= new Date().toISOString().slice(0, 10) && a.maturity_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    if (due30.length) sig.push(`30天内到期${fmtAmount(due30.reduce((t, a) => t + a.amount, 0))}元`);
    const idle = r.assets.filter((a) => a.category === '存款' && !a.maturity_date).reduce((t, a) => t + (a.amount || 0), 0);
    if (idle > 0) sig.push(`闲置${fmtAmount(idle)}元`);
    if (total > 0) {
      const byCat = {};
      for (const a of r.assets) byCat[a.category] = (byCat[a.category] || 0) + (a.amount || 0);
      const top = Object.entries(byCat).sort((x, y) => y[1] - x[1])[0];
      if (top[1] / total >= 0.7) sig.push(`${top[0]}占${Math.round((top[1] / total) * 100)}%`);
    }
    return `- #${c.id} ${c.name}｜资产${fmtAmount(total)}｜${c.risk_level || '风险未知'}｜${(c.tags || []).join('、') || '无标签'}｜${missing.length ? '缺:' + missing.join('/') : '资料齐全'}｜${relation}${sig.length ? '｜' + sig.join('，') : ''}`;
  });

  const leads = db
    .prepare(
      `SELECT m.content, m.created_at, c.name FROM chat_messages m LEFT JOIN customers c ON c.id = m.customer_id
       WHERE m.role='user' AND (m.content LIKE '%朋友%' OR m.content LIKE '%推荐%' OR m.content LIKE '%介绍%' OR m.content LIKE '%转介%'
         OR m.content LIKE '%老婆%' OR m.content LIKE '%老公%' OR m.content LIKE '%爱人%' OR m.content LIKE '%家人%' OR m.content LIKE '%父母%'
         OR m.content LIKE '%孩子%' OR m.content LIKE '%儿子%' OR m.content LIKE '%女儿%' OR m.content LIKE '%同事%' OR m.content LIKE '%亲戚%')
       ORDER BY m.id DESC LIMIT 10`
    )
    .all();
  const leadText = leads.length
    ? leads.map((l) => `- (${l.name || '未关联客户'} ${String(l.created_at).slice(5, 16)}) ${l.content.slice(0, 60)}`).join('\n')
    : '（沟通记录中暂未发现转介绍线索）';

  return `【客户雷达扫描】（系统计算，共 ${lines.length} 位）\n${lines.join('\n')}\n\n【转介绍线索】（沟通记录关键词匹配）\n${leadText}`;
}

/** 在售产品库文本（推荐话术优先引用） */
function productRosterText() {
  const rows = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY category, id DESC').all();
  if (!rows.length) return '';
  return `\n【在售产品库】（推荐话术优先引用其中的具体产品，务必检查产品风险等级与客户风险等级匹配）\n${rows
    .map(
      (p) =>
        `- ${p.name}｜${p.category}｜${p.risk_level || '风险未标'}${p.expected_rate ? `｜基准${p.expected_rate}` : ''}${p.term ? `｜${p.term}` : ''}${p.min_amount ? `｜${fmtAmount(p.min_amount)}元起` : ''}${p.highlights ? `｜${p.highlights}` : ''}`
    )
    .join('\n')}`;
}

function buildPrompt(customerRows, type) {
  const today = new Date().toLocaleDateString('zh-CN');
  if (type === 'radar') {
    return `当前日期：${today}。请基于雷达扫描数据生成「客户雷达 · 隐藏商机报告」，包含：
## 一、雷达总览（客户数、总资产、有信号客户数，两三句话说清全局）
## 二、被忽视的高价值客户（资产排名靠前但"从未沟通/资料空白/长期未联系"的——每个说明为什么是隐藏商机、从哪切入）
## 三、即时商机（30天内到期 / 大额闲置，按金额排序，每条配一句开场话术，标注渠道）
## 四、转介绍线索（沟通记录中提到的人，评估跟进价值，没有则说明）
## 五、本周行动清单（先联系谁、用什么由头、预期目标）

${radarScanText(customerRows)}${productRosterText()}`;
  }
  if (type === 'portfolio') {
    const blocks = customerRows.map((r) => customerBlock(r.customer, r.assets)).join('\n\n');
    const allAssets = customerRows.flatMap((r) => r.assets);
    const signals = marketingSignals({}, allAssets);
    return `当前日期：${today}。以下是我的 ${customerRows.length} 位客户。请生成「客群营销作战卡」，包含：
## 一、客群快照（结构特征 + 营销含义）
## 二、批量营销机会（按优先级：到期承接 > 闲置激活 > 错配调整 > 事件营销；给出客户名单和金额）
## 三、分层话术模板（每层给 1 段可直接群发/逐个微调的话术，标注渠道）
## 四、本周动作清单（具体到打给谁、说什么）

【客群营销信号】（系统计算）
${signals}${productRosterText()}

【客户资料】
${blocks}`;
  }
  const r = customerRows[0];
  const c = r.customer;
  const signals = marketingSignals(c, r.assets);
  const task = {
    profile: `请生成「客户偏好画像」，包含：
## 一、基本画像（一句话概括 + 关键特征）
## 二、行为与偏好洞察（结合偏好描述、标签、资产构成推断，指出营销切入点）
## 三、关系维护要点（沟通风格、话题偏好、禁忌提示）
## 四、建议跟进事项（可执行的具体动作）`,
    allocation: `请生成「资产配置分析」，包含：
## 一、配置结构分析（各类别金额与占比、集中度评估）
## 二、期限结构（起息/到期分布，流动性评估，到期承接窗口）
## 三、风险匹配度（现有配置与客户风险等级的匹配情况，错配即营销机会）
## 四、再配置建议（方向性参考 + 对应的沟通切入点）`,
    marketing: `请生成「营销作战卡」，这是客户经理最常用的报告，要求每个机会都配**拿来就能说的话术**，包含：
## 一、客户快照（一句话画像 + 最关键的 2-3 个数字）
## 二、营销机会清单（按优先级排序，每条标注触发点：到期承接 / 闲置激活 / 错配调整 / 事件营销 / 偏好缺口，并说明为什么是现在）
## 三、推荐话术（每个机会给 1-2 段可直接使用的话术，口语化，标注适用渠道：电话 / 微信 / 面谈）
## 四、异议应对（预测该客户最可能的 2-3 个说法，如"再想想""收益不高""要用钱"，每个给应对话术）
## 五、跟进节奏（本周 / 本月的动作与时机，结合到期日和生日）`,
  }[type] || '';
  return `当前日期：${today}。${task}

【营销信号】（系统计算，优先引用）
${signals}${productRosterText()}

【客户资料】
${customerBlock(c, r.assets)}`;
}

// 生成分析：{ customer_ids: [..], type: 'marketing'|'profile'|'allocation'|'radar', masked?: bool }
// radar = 客户雷达：全库扫描挖掘隐藏商机，无需指定客户
analysisRouter.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    let ids = (Array.isArray(body.customer_ids) ? body.customer_ids : [body.customer_ids])
      .map(Number)
      .filter((n) => n > 0);
    let type = body.type || 'profile';
    if (type === 'radar') {
      ids = db.prepare('SELECT id FROM customers').all().map((r) => r.id);
      if (!ids.length) return res.status(400).json({ error: '客户库为空，先录入客户再扫描' });
    } else {
      if (!ids.length) return res.status(400).json({ error: '请先选择要分析的客户' });
      if (ids.length > 1) type = 'portfolio';
    }
    if (!TYPE_LABEL[type]) {
      return res.status(400).json({ error: '未知的分析类型' });
    }
    const masked = type === 'radar' ? false : body.masked === undefined ? getSetting('mask_enabled', '1') === '1' : Boolean(body.masked);

    const customerRows = ids.map((id) => {
      let c = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
      if (!c) {
        const err = new Error(`客户 #${id} 不存在`);
        err.status = 404;
        throw err;
      }
      // tags 解析
      try {
        c.tags = JSON.parse(c.tags || '[]');
      } catch {
        c.tags = [];
      }
      const assets = db.prepare('SELECT * FROM assets WHERE customer_id = ? ORDER BY amount DESC').all(id);
      return { customer: masked ? maskCustomer(c, ids.indexOf(id)) : c, assets };
    });

    const model = glmConfig().analysisModel;
    const content = await chat({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(customerRows, type) },
      ],
    });
    if (!content) return res.status(502).json({ error: 'AI 未返回内容，请稍后重试' });

    const single = ids.length === 1 ? ids[0] : null;
    const name = type === 'radar' ? '客户雷达（全库）' : single ? customerRows[0].customer.name : `客群分析（${ids.length} 人）`;
    const info = db
      .prepare('INSERT INTO analysis_records (customer_id, customer_name, analysis_type, masked, content, model) VALUES (?, ?, ?, ?, ?, ?)')
      .run(single, name, type, masked ? 1 : 0, content, model);
    const row = db.prepare('SELECT * FROM analysis_records WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (e) {
    next(e);
  }
});

// 历史列表（可按客户过滤）
analysisRouter.get('/', (req, res) => {
  const { customer_id = '' } = req.query;
  const rows = customer_id
    ? db.prepare('SELECT * FROM analysis_records WHERE customer_id = ? ORDER BY id DESC LIMIT 100').all(Number(customer_id))
    : db.prepare('SELECT * FROM analysis_records ORDER BY id DESC LIMIT 100').all();
  res.json({ list: rows });
});

analysisRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM analysis_records WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '报告不存在' });
  res.json(row);
});

analysisRouter.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM analysis_records WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '报告不存在' });
  res.json({ ok: true });
});
