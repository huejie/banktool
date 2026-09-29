<template>
  <div class="safe-top">
    <van-nav-bar title="客户详情" left-arrow fixed placeholder right-text="编辑" class="nav-plain" @click-left="$router.back()" @click-right="$router.push(`/customer/${c.id}/edit`)" />
    <div class="page" v-if="loaded">

      <!-- 基本信息 -->
      <div class="card">
        <div class="row-between">
          <div class="row">
            <div class="avatar">{{ (c.name || '?').charAt(0) }}</div>
            <div>
              <div class="row" style="gap: 6px">
                <span style="font-size: 18px; font-weight: 800">{{ c.name }}</span>
                <span v-if="c.risk_level" class="tag-chip">{{ c.risk_level }}</span>
                <span v-if="c.gender" class="tag-chip plain">{{ c.gender }}</span>
              </div>
              <div class="muted" style="margin-top: 3px">
                <span v-if="c.phone" class="num">{{ c.phone }}</span>
                <span v-if="c.company"> · {{ c.company }}{{ c.title ? ' · ' + c.title : '' }}</span>
              </div>
            </div>
          </div>
          <div style="text-align: right">
            <div class="faint">总资产（元）</div>
            <div class="amount amount-lg num">{{ fmtMoney(totalAssets) }}</div>
          </div>
        </div>
        <div v-if="c.birthday" class="faint" style="margin-top: 8px">🎂 {{ c.birthday }}</div>
        <div v-if="c.tags && c.tags.length" style="margin-top: 8px">
          <span v-for="t in c.tags" :key="t" class="tag-chip">{{ t }}</span>
        </div>
        <div v-if="c.preferences" class="preference-block">
          <div class="faint" style="margin-bottom: 3px">偏好描述</div>
          <div style="font-size: 14px">{{ c.preferences }}</div>
        </div>
        <div v-if="c.notes" style="margin-top: 8px" class="muted">{{ c.notes }}</div>
      </div>

      <!-- 资产记录 -->
      <div class="section-title">
        <span>资产记录（{{ c.assets.length }}）</span>
        <span class="link" @click="$router.push(`/asset/new?customerId=${c.id}`)">＋ 添加</span>
      </div>
      <div v-for="a in c.assets" :key="a.id">
        <div class="card card-tight asset-row" @click="$router.push(`/asset/${a.id}/edit`)">
          <div class="row-between">
            <div class="grow">
              <div class="row" style="gap: 6px">
                <span class="cat-dot" :style="{ background: CATEGORY_COLOR[a.category] || '#999' }"></span>
                <span style="font-weight: 600">{{ a.product_name || '未命名产品' }}</span>
                <span class="tag-chip plain" style="padding: 0 6px">{{ a.category }}</span>
              </div>
              <div class="faint num" style="margin-top: 3px">
                <template v-if="a.rate">利率 {{ a.rate}} · </template>
                <template v-if="a.start_date">{{ a.start_date }}</template>
                <template v-if="a.maturity_date"> → {{ a.maturity_date }}</template>
                <template v-if="!a.rate && !a.start_date && !a.maturity_date">—</template>
              </div>
            </div>
            <div class="row" style="gap: 2px">
              <div class="amount num" style="font-size: 15px">{{ fmtMoney(a.amount) }}</div>
              <van-icon name="delete-o" style="color: var(--ink-3); font-size: 18px; padding: 6px" @click.stop="deleteAsset(a)" />
            </div>
          </div>
        </div>
      </div>
      <div v-if="!c.assets.length" class="empty" style="padding: 20px">暂无资产记录，可拍照识别批量导入</div>

      <!-- 沟通记录（对话归档），默认收起 -->
      <template v-if="chatRecords.length">
        <div class="section-title">
          <span>沟通记录（{{ chatRecords.length }}）</span>
          <span class="link" @click="chatExpanded = !chatExpanded">{{ chatExpanded ? '收起' : '展开' }}</span>
        </div>
        <div v-if="!chatExpanded" class="card card-tight muted ellipsis" style="cursor: pointer; font-size: 13.5px" @click="chatExpanded = true">
          最新：{{ chatRecords[chatRecords.length - 1].content.slice(0, 40) }}…
        </div>
        <div v-else class="card">
          <div v-for="r in chatRecords" :key="r.id" class="chat-record">
            <div class="row-between">
              <span class="tag-chip" :class="r.role === 'user' ? 'amber' : 'plain'">{{ r.role === 'user' ? '口述' : 'AI' }}</span>
              <span class="faint num">{{ fmtDate(r.created_at) }}</span>
            </div>
            <div class="muted" style="margin-top: 4px; white-space: pre-wrap; font-size: 13.5px">{{ r.content }}</div>
          </div>
        </div>
      </template>

      <!-- 分析历史 -->
      <div class="section-title"><span>AI 分析（{{ c.analyses.length }}）</span></div>
      <div v-for="r in c.analyses" :key="r.id" class="card card-tight report-row" @click="viewReport(r)">
        <div class="row-between">
          <span class="tag-chip amber">{{ TYPE_LABEL[r.analysis_type] || r.analysis_type }}</span>
          <span class="faint num">{{ fmtDate(r.created_at) }}</span>
        </div>
        <div class="ellipsis muted" style="margin-top: 5px">{{ plainPreview(r.content) }}</div>
      </div>
      <div v-if="!c.analyses.length" class="empty" style="padding: 20px">还没有 AI 分析报告</div>

      <div class="row" style="gap: 10px; margin-top: 18px">
        <van-button round block plain type="primary" @click="$router.push(`/chat?customer=${c.id}`)">
          <van-icon name="chat-o" style="vertical-align: -2px" /> 对话速记
        </van-button>
        <van-button round block type="primary" @click="$router.push(`/analysis?customer=${c.id}`)">
          <van-icon name="chart-trending-o" style="vertical-align: -2px" /> AI 分析
        </van-button>
      </div>
    </div>

    <ReportView :show="reportShow" :title="reportTitle" :subtitle="reportSubtitle" :content="reportContent" deletable @close="reportShow = false" @delete="deleteReport" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { NavBar as VanNavBar, SwipeCell as VanSwipeCell, Button as VanButton, Icon as VanIcon } from 'vant';
import { api } from '../api/index.js';
import { fmtMoney, fmtDate, CATEGORY_COLOR } from '../utils/format.js';
import ReportView from '../components/ReportView.vue';

const TYPE_LABEL = { profile: '偏好画像', allocation: '配置分析', marketing: '营销作战卡', portfolio: '客群分析' };

const route = useRoute();
const c = ref({ assets: [], analyses: [], tags: [] });
const chatRecords = ref([]);
const chatExpanded = ref(false);
const loaded = ref(false);
const totalAssets = computed(() => (c.value.assets || []).reduce((t, a) => t + (a.amount || 0), 0));

const reportShow = ref(false);
const reportTitle = ref('');
const reportSubtitle = ref('');
const reportContent = ref('');
const currentReport = ref(null);

function plainPreview(md) {
  return String(md || '').replace(/[#>*`\-\|]/g, '').replace(/\s+/g, ' ').slice(0, 60);
}

function viewReport(r) {
  currentReport.value = r;
  reportTitle.value = `${TYPE_LABEL[r.analysis_type] || r.analysis_type}`;
  reportSubtitle.value = `${fmtDate(r.created_at)} · ${r.model || ''}${r.masked ? ' · 已脱敏' : ''}`;
  reportContent.value = r.content;
  reportShow.value = true;
}

async function deleteReport() {
  if (!currentReport.value) return;
  await api.deleteAnalysis(currentReport.value.id);
  reportShow.value = false;
  showToast('已删除');
  load();
}

function deleteAsset(a) {
  showConfirmDialog({ title: '删除资产', message: `确定删除「${a.product_name || a.category}」这笔记录吗？` })
    .then(async () => {
      await api.deleteAsset(a.id);
      showToast('已删除');
      load();
    })
    .catch(() => {});
}

async function load() {
  try {
    c.value = await api.getCustomer(route.params.id);
    loaded.value = true;
    api.listChatMessages({ customer_id: route.params.id, limit: 50 })
      .then((d) => (chatRecords.value = d.list))
      .catch(() => {});
  } catch (e) {
    showToast(e.message);
  }
}

onMounted(load);
</script>

<style scoped>
.avatar {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: var(--primary);
  color: #f5e7c6;
  font-weight: 700;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 2px;
}
.preference-block {
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--amber-soft);
  border-radius: 8px;
}
.asset-row:active, .report-row:active { background: #faf8f3; }
.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.chat-record { padding: 8px 0; border-bottom: 1px dashed var(--line); }
.chat-record:last-child { border-bottom: none; padding-bottom: 2px; }
.chat-record:first-child { padding-top: 2px; }
</style>
