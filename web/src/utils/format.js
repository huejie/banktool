export function fmtMoney(n) {
  return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export function fmtDate(s) {
  if (!s) return '';
  return String(s).replace('T', ' ').replace(/\.\d+$/, '').slice(0, 16);
}

export const CATEGORIES = ['存款', '理财', '基金', '保险', '信托', '贵金属', '其他'];

export const RISK_LEVELS = ['保守型', '稳健型', '平衡型', '进取型', '激进型'];

export const CATEGORY_COLOR = {
  存款: '#1f3a5f',
  理财: '#b45309',
  基金: '#1b7a43',
  保险: '#6b5b95',
  信托: '#8a4f3d',
  贵金属: '#a16207',
  其他: '#5d6b7a',
};
