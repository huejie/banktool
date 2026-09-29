import * as XLSX from 'xlsx';
import { fmtDate } from './format.js';

/** 导出资产明细为 xlsx */
export function exportAssetsExcel(rows, filename = '资产明细.xlsx') {
  const data = rows.map((r, i) => ({
    序号: i + 1,
    客户: r.customer_name || '',
    类别: r.category || '',
    产品名称: r.product_name || '',
    金额: Number(r.amount) || 0,
    参考利率: r.rate || '',
    起始日: r.start_date || '',
    到期日: r.maturity_date || '',
    备注: r.notes || '',
    录入时间: fmtDate(r.record_date),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '资产明细');
  XLSX.writeFile(wb, filename);
}
