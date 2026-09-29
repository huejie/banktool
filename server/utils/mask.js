/** 发送给 AI 前的客户信息脱敏 */

export function maskPhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

export function maskName(name, index = 0) {
  if (!name) return '';
  const label = String.fromCharCode(65 + (index % 26));
  const surname = String(name).trim().charAt(0) || '';
  return `${surname}客户${label}`;
}

/**
 * 返回脱敏后的客户对象（不修改原对象）。
 * 姓名 → "张客户A"；电话 → 138****5678。其余字段保留供分析使用。
 */
export function maskCustomer(customer, index = 0) {
  return {
    ...customer,
    name: maskName(customer.name, index),
    phone: maskPhone(customer.phone),
  };
}
