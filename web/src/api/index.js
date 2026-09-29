async function request(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = `请求失败（${res.status}）`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function qs(params = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // 客户
  listCustomers: (params) => request(`/api/customers${qs(params)}`),
  getCustomer: (id) => request(`/api/customers/${id}`),
  createCustomer: (data) => request('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateCustomer: (id, data) => request(`/api/customers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteCustomer: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),

  // 资产
  listAssets: (params) => request(`/api/assets${qs(params)}`),
  createAssets: (items) => request('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }),
  updateAsset: (id, data) => request(`/api/assets/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteAsset: (id) => request(`/api/assets/${id}`, { method: 'DELETE' }),

  // OCR
  ocr: (formData) => request('/api/ocr', { method: 'POST', body: formData }),
  listOcrRecords: () => request('/api/ocr/records'),
  deleteOcrRecord: (id) => request(`/api/ocr/records/${id}`, { method: 'DELETE' }),

  // 分析
  generateAnalysis: (data) => request('/api/analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  listAnalysis: (params) => request(`/api/analysis${qs(params)}`),
  getAnalysis: (id) => request(`/api/analysis/${id}`),
  deleteAnalysis: (id) => request(`/api/analysis/${id}`, { method: 'DELETE' }),

  // 对话
  listChatMessages: (params) => request(`/api/chat/messages${qs(params)}`),
  sendChat: (data) => fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }), // 返回原始 Response，由调用方读 SSE 流
  assignChatMessage: (id, customer_id) => request(`/api/chat/messages/${id}/assign`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id }) }),
  applyChat: (message_id, payload) => request('/api/chat/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message_id, ...payload }) }),
  deleteChatMessage: (id) => request(`/api/chat/messages/${id}`, { method: 'DELETE' }),
  clearChat: () => request('/api/chat/messages?all=1', { method: 'DELETE' }),

  // 产品库
  listProducts: (params) => request(`/api/products${qs(params)}`),
  createProduct: (data) => request('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteProduct: (id) => request(`/api/products/${id}`, { method: 'DELETE' }),

  // 设置
  getSettings: () => request('/api/settings'),
  saveSettings: (data) => request('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  testSettings: () => request('/api/settings/test', { method: 'POST' }),
};
