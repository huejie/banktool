<template>
  <div class="safe-top">
    <div class="page-wide">
      <div class="row-between" style="padding: 4px 2px 10px">
        <div style="font-size: 20px; font-weight: 800">资产表格</div>
        <van-button size="small" plain type="primary" icon="down" @click="exportExcel">导出 Excel</van-button>
      </div>

      <!-- 筛选 -->
      <div class="card card-tight">
        <div class="row" style="flex-wrap: wrap; gap: 8px">
          <van-field :model-value="filters.customer_id ? customerName : ''" is-link readonly label="客户" label-width="42px" placeholder="全部" style="flex: 1; min-width: 130px; padding: 4px 2px" @click="showCustomerPick = true" />
          <select v-model="filters.category" class="mini-select" style="width: auto">
            <option value="">全部类别</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="row" style="gap: 8px; margin-top: 6px">
          <van-field :model-value="filters.from" is-link readonly label="起息" label-width="42px" placeholder="不限" style="flex: 1; padding: 4px 2px" @click="pickDateFor = 'from'" />
          <span class="faint">→</span>
          <van-field :model-value="filters.to" is-link readonly label="到期" label-width="42px" placeholder="不限" style="flex: 1; padding: 4px 2px" @click="pickDateFor = 'to'" />
          <van-icon v-if="filters.from || filters.to" name="clear" style="color: var(--ink-3); font-size: 17px" @click="filters.from = ''; filters.to = ''" />
        </div>
      </div>

      <!-- 汇总 -->
      <div class="card">
        <div class="row-between" style="margin-bottom: 10px">
          <div>
            <div class="faint">筛选后资产总额（元）</div>
            <div class="amount amount-lg num">{{ fmtMoney(data.total) }}</div>
          </div>
          <div class="faint">{{ list.length }} 笔记录</div>
        </div>
        <div v-for="cat in catStats" :key="cat.name" style="margin-bottom: 8px">
          <div class="row-between" style="font-size: 13px; margin-bottom: 3px">
            <span>{{ cat.name }}</span>
            <span class="num muted">{{ fmtMoney(cat.amount) }} · {{ cat.pct }}%</span>
          </div>
          <div class="cat-bar"><i :style="{ width: cat.pct + '%', background: CATEGORY_COLOR[cat.name] || '#999' }"></i></div>
        </div>
      </div>

      <!-- 移动端卡片 -->
      <div class="mobile-only">
        <div v-for="r in list" :key="r.id" class="card card-tight" style="cursor: pointer" @click="$router.push(`/asset/${r.id}/edit`)">
          <div class="row-between">
            <div class="grow" style="min-width: 0">
              <div class="row" style="gap: 6px">
                <span style="font-weight: 600" class="ellipsis">{{ r.product_name || '未命名产品' }}</span>
                <span class="tag-chip plain" style="padding: 0 6px; flex-shrink: 0">{{ r.category }}</span>
              </div>
              <div class="faint" style="margin-top: 2px">{{ r.customer_name }}<template v-if="r.maturity_date"> · 到期 {{ r.maturity_date }}</template></div>
            </div>
            <div class="amount num" style="font-size: 15px">{{ fmtMoney(r.amount) }}</div>
          </div>
        </div>
      </div>

      <!-- 宽屏表格 -->
      <div class="desktop-only card table-wrap" style="padding: 6px 10px">
        <table class="data-table">
          <thead>
            <tr>
              <th>客户</th><th>类别</th><th>产品名称</th>
              <th class="num">金额（元）</th><th>利率</th><th>起始日</th><th>到期日</th><th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in list" :key="r.id" style="cursor: pointer" @click="$router.push(`/asset/${r.id}/edit`)">
              <td>{{ r.customer_name }}</td>
              <td><span class="tag-chip plain">{{ r.category }}</span></td>
              <td class="ellipsis" style="max-width: 220px">{{ r.product_name || '—' }}</td>
              <td class="num amount-sm num">{{ fmtMoney(r.amount) }}</td>
              <td class="num">{{ r.rate || '—' }}</td>
              <td class="num">{{ r.start_date || '—' }}</td>
              <td class="num">{{ r.maturity_date || '—' }}</td>
              <td class="muted ellipsis" style="max-width: 160px">{{ r.notes || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!list.length && !loading" class="empty">
        <van-icon name="records" />
        没有符合条件的资产记录
      </div>
    </div>

    <!-- 客户选择 -->
    <van-popup :show="showCustomerPick" round position="bottom" style="height: 70%" @update:show="showCustomerPick = $event">
      <div class="picker-page">
        <van-search v-model="pickQ" placeholder="搜索客户" />
        <div class="picker-list">
          <div class="picker-item" @click="chooseCustomer(null)"><span style="color: var(--primary)">全部客户</span></div>
          <div v-for="item in pickFiltered" :key="item.id" class="picker-item" @click="chooseCustomer(item)">
            <span>{{ item.name }}</span>
            <span class="faint num">{{ item.phone }}</span>
          </div>
        </div>
      </div>
    </van-popup>

    <van-popup :show="pickDateFor !== ''" round position="bottom" @update:show="(v) => { if (!v) pickDateFor = ''; }">
      <van-date-picker
        title="选择日期"
        @confirm="({ selectedValues }) => { filters[pickDateFor] = selectedValues.join('-'); pickDateFor = ''; }"
        @cancel="pickDateFor = ''"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { showToast } from 'vant';
import { Button as VanButton, Field as VanField, Icon as VanIcon, Popup as VanPopup, DatePicker as VanDatePicker, Search as VanSearch } from 'vant';
import { api } from '../api/index.js';
import { fmtMoney, CATEGORIES, CATEGORY_COLOR } from '../utils/format.js';
import { exportAssetsExcel } from '../utils/export.js';

const filters = reactive({ customer_id: '', category: '', from: '', to: '' });
const data = ref({ list: [], total: 0, by_category: {} });
const loading = ref(false);
const customers = ref([]);
const customerName = ref('');
const showCustomerPick = ref(false);
const pickQ = ref('');
const pickDateFor = ref('');

const list = computed(() => data.value.list || []);

const catStats = computed(() => {
  const entries = Object.entries(data.value.by_category || {}).sort((a, b) => b[1] - a[1]);
  const total = data.value.total || 0;
  return entries.map(([name, amount]) => ({
    name,
    amount,
    pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
  }));
});

const pickFiltered = computed(() => {
  const q = pickQ.value.trim();
  if (!q) return customers.value;
  return customers.value.filter((c) => c.name.includes(q) || (c.phone || '').includes(q));
});

function chooseCustomer(item) {
  filters.customer_id = item ? item.id : '';
  customerName.value = item ? item.name : '';
  showCustomerPick.value = false;
}

async function load() {
  loading.value = true;
  try {
    data.value = await api.listAssets(filters);
  } catch (e) {
    showToast(e.message);
  } finally {
    loading.value = false;
  }
}

function exportExcel() {
  if (!list.value.length) {
    showToast('没有可导出的数据');
    return;
  }
  const parts = [customerName.value || '全部客户', filters.category || '全部类别'];
  const name = `资产明细_${parts.join('_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  exportAssetsExcel(list.value, name);
}

watch(filters, load);
onMounted(load);
</script>

<style scoped>
.mobile-only { display: block; }
.desktop-only { display: none; }
@media (min-width: 768px) {
  .mobile-only { display: none; }
  .desktop-only { display: block; }
}
.mini-select {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 14px;
  background: #fff;
}
.picker-page { height: 100%; display: flex; flex-direction: column; }
.picker-list { flex: 1; overflow-y: auto; padding: 0 4px 12px; }
.picker-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.picker-item:active { background: #faf8f3; }
</style>
