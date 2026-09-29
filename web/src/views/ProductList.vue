<template>
  <div class="safe-top">
    <van-nav-bar title="产品库" left-arrow fixed placeholder right-text="新增" class="nav-plain" @click-left="$router.back()" @click-right="$router.push('/product/new')" />
    <div class="page">
      <div class="faint" style="padding: 0 2px 10px">录入在售产品后，AI 营销作战卡与对话推荐会自动引用（含风险匹配检查）</div>

      <van-search v-model="q" placeholder="搜索名称 / 代码 / 卖点" shape="round" @update:model-value="onFilter" />
      <div class="row" style="gap: 6px; margin-bottom: 12px; flex-wrap: wrap; padding: 0 2px">
        <span v-for="c in ['全部', ...CATEGORIES]" :key="c" class="tag-chip" :class="{ plain: cat !== c }" style="cursor: pointer; font-size: 12.5px" @click="cat = c; load()">{{ c }}</span>
      </div>

      <van-swipe-cell v-for="p in list" :key="p.id" class="swipe-item">
        <div class="card card-tight product-card" @click="$router.push(`/product/${p.id}/edit`)">
          <div class="row-between">
            <div class="grow" style="min-width: 0">
              <div class="row" style="gap: 6px">
                <span class="cat-dot" :style="{ background: CATEGORY_COLOR[p.category] || '#999' }"></span>
                <span style="font-weight: 700; font-size: 15px" class="ellipsis">{{ p.name }}</span>
                <span v-if="!p.is_active" class="tag-chip plain">已下架</span>
              </div>
              <div class="faint num" style="margin-top: 3px">
                <template v-if="p.risk_level">{{ p.risk_level }}</template>
                <template v-if="p.expected_rate"> · 基准 {{ p.expected_rate }}</template>
                <template v-if="p.term"> · {{ p.term }}</template>
                <template v-if="p.min_amount"> · {{ fmtMoney(p.min_amount) }}元起</template>
              </div>
            </div>
          </div>
          <div v-if="p.highlights" class="muted" style="margin-top: 5px; font-size: 13px">{{ p.highlights }}</div>
        </div>
        <template #right>
          <van-button square type="danger" text="删除" style="height: 100%" @click="onDelete(p)" />
        </template>
      </van-swipe-cell>

      <div v-if="!list.length && !loading" class="empty">
        <van-icon name="bag-o" />
        {{ q || cat !== '全部' ? '没有符合条件的产品' : '产品库为空，点右上角「新增」录入理财/基金/信托等产品' }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import {
  NavBar as VanNavBar, Search as VanSearch, SwipeCell as VanSwipeCell, Button as VanButton, Icon as VanIcon,
} from 'vant';
import { api } from '../api/index.js';
import { fmtMoney, CATEGORIES, CATEGORY_COLOR } from '../utils/format.js';

const q = ref('');
const cat = ref('全部');
const list = ref([]);
const loading = ref(false);

let timer = null;
function onFilter() {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
}

async function load() {
  loading.value = true;
  try {
    const data = await api.listProducts({
      q: q.value,
      category: cat.value === '全部' ? '' : cat.value,
      include_inactive: '1',
    });
    list.value = data.list;
  } catch (e) {
    showToast(e.message);
  } finally {
    loading.value = false;
  }
}

function onDelete(p) {
  showConfirmDialog({ title: '删除产品', message: `确定删除「${p.name}」吗？` })
    .then(async () => {
      await api.deleteProduct(p.id);
      showToast('已删除');
      load();
    })
    .catch(() => {});
}

onMounted(load);
</script>

<style scoped>
.product-card:active { background: #faf8f3; }
.cat-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.swipe-item { display: block; }
</style>
