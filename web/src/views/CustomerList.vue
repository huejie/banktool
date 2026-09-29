<template>
  <div class="safe-top">
    <div class="page">
      <!-- 顶部操作栏（固定吸顶） -->
      <div class="home-header">
        <div>
          <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.02em">客户簿</div>
          <div class="faint" style="margin-top: 2px">{{ list.length }} 位客户 · 资产总额 <span class="num">{{ fmtMoney(totalAssets) }}</span> 元</div>
        </div>
        <div class="row" style="gap: 2px">
          <van-icon name="scan" style="font-size: 21px; color: var(--ink-2); padding: 6px" @click="$router.push('/ocr')" />
          <van-icon name="bag-o" style="font-size: 21px; color: var(--ink-2); padding: 6px" @click="$router.push('/products')" />
          <van-icon name="setting-o" style="font-size: 21px; color: var(--ink-2); padding: 6px" @click="$router.push('/settings')" />
        </div>
      </div>

      <van-search v-model="q" placeholder="搜索姓名 / 电话 / 单位" shape="round" @update:model-value="onFilter" />

      <van-dropdown-menu class="filter-bar" active-color="#1f3a5f">
        <van-dropdown-item v-model="risk" :options="riskOptions" @change="onFilter" />
        <van-dropdown-item v-model="tag" :options="tagOptions" @change="onFilter" />
      </van-dropdown-menu>

      <!-- 客户卡片 -->
      <van-pull-refresh :model-value="refreshing" @update:model-value="(v) => (refreshing = v)" success-text="已刷新" @refresh="load">
        <van-swipe-cell v-for="c in list" :key="c.id" class="swipe-item">
          <div class="card card-tight customer-card" @click="$router.push(`/customer/${c.id}`)">
            <div class="row-between">
              <div class="row grow">
                <div class="avatar">{{ (c.name || '?').charAt(0) }}</div>
                <div class="grow">
                  <div class="row" style="gap: 6px">
                    <span style="font-weight: 700; font-size: 15.5px">{{ c.name }}</span>
                    <span v-if="c.risk_level" class="tag-chip" style="padding: 0 6px">{{ c.risk_level }}</span>
                  </div>
                  <div class="faint ellipsis" style="margin-top: 2px">
                    <span v-if="c.phone" class="num">{{ c.phone }}</span>
                    <span v-if="c.company"> · {{ c.company }}</span>
                    <span v-if="!c.phone && !c.company">暂无联系方式</span>
                  </div>
                </div>
              </div>
              <div style="text-align: right">
                <div class="amount num">{{ fmtMoney(c.total_assets) }}</div>
                <div class="faint">{{ c.asset_count ? `${c.asset_count} 笔资产` : '无资产记录' }}</div>
              </div>
            </div>
            <div v-if="c.tags && c.tags.length" style="margin-top: 6px">
              <span v-for="t in c.tags.slice(0, 6)" :key="t" class="tag-chip plain">{{ t }}</span>
            </div>
          </div>
          <template #right>
            <van-button square type="danger" text="删除" class="delete-btn" @click="onDelete(c)" />
          </template>
        </van-swipe-cell>

        <div v-if="!list.length && !loading" class="empty">
          <van-icon name="friends-o" />
          {{ q || risk || tag ? '没有符合条件的客户' : '还没有客户，点击右下角 + 新建' }}
        </div>
      </van-pull-refresh>
    </div>

    <!-- 新建按钮 -->
    <div class="fab" @click="$router.push('/customer/new')"><van-icon name="plus" /></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import {
  Search as VanSearch, DropdownMenu as VanDropdownMenu, DropdownItem as VanDropdownItem,
  PullRefresh as VanPullRefresh, SwipeCell as VanSwipeCell, Button as VanButton, Icon as VanIcon,
} from 'vant';
import { api } from '../api/index.js';
import { fmtMoney, RISK_LEVELS } from '../utils/format.js';

const q = ref('');
const risk = ref('');
const tag = ref('');
const list = ref([]);
const totalAssets = ref(0);
const loading = ref(false);
const refreshing = ref(false);

const riskOptions = computed(() => [
  { text: '全部风险等级', value: '' },
  ...RISK_LEVELS.map((r) => ({ text: r, value: r })),
]);
const tagOptions = computed(() => {
  const set = new Set();
  for (const c of list.value) (c.tags || []).forEach((t) => set.add(t));
  return [{ text: '全部标签', value: '' }, ...[...set].sort().map((t) => ({ text: t, value: t }))];
});

let filterTimer = null;
function onFilter() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(load, 250);
}

async function load() {
  loading.value = true;
  try {
    const data = await api.listCustomers({ q: q.value, risk: risk.value, tag: tag.value });
    list.value = data.list;
    totalAssets.value = data.total_assets;
  } catch (e) {
    showToast(e.message);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function onDelete(c) {
  showConfirmDialog({ title: '删除客户', message: `将同时删除「${c.name}」的全部资产记录与分析历史，确定吗？` })
    .then(async () => {
      await api.deleteCustomer(c.id);
      showToast('已删除');
      load();
    })
    .catch(() => {});
}

onMounted(load);
</script>

<style scoped>
.home-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--paper);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 2px;
  margin: 0 -12px 0;
  padding-left: 16px;
  padding-right: 16px;
}
.filter-bar {
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 12px;
  border: 1px solid var(--line);
}
.customer-card:active { background: #faf8f3; }
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--primary);
  color: #f5e7c6;
  font-weight: 700;
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.swipe-item { display: block; margin-bottom: 0; }
.delete-btn { height: 100%; }
.fab {
  position: fixed;
  right: 20px;
  bottom: calc(76px + env(safe-area-inset-bottom));
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  box-shadow: 0 6px 16px rgba(31, 58, 95, 0.35);
  z-index: 10;
}
</style>
