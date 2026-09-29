<template>
  <div class="safe-top">
    <div class="page">
      <div style="font-size: 20px; font-weight: 800; padding: 4px 2px 10px">AI 分析</div>

      <!-- 分析类型（置顶，雷达免选客户） -->
      <div class="card">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 10px">分析类型</div>
        <div class="type-grid">
          <div v-for="t in TYPES" :key="t.value" class="type-item" :class="{ active: type === t.value }" @click="type = t.value">
            <van-icon :name="t.icon" />
            <div style="font-weight: 600; font-size: 13.5px; margin-top: 3px">{{ t.label }}</div>
            <div class="faint" style="font-size: 11.5px">{{ t.desc }}</div>
          </div>
        </div>
      </div>

      <!-- 客户选择（雷达模式跳过） -->
      <div class="card" v-if="type !== 'radar'">
        <div class="row-between" style="margin-bottom: 8px">
          <span style="font-weight: 600; font-size: 14px">选择客户<span class="faint">（可多选）</span></span>
          <span class="link" @click="openPick">＋ 添加</span>
        </div>
        <div v-if="selected.length">
          <span v-for="c in selected" :key="c.id" class="tag-chip" style="cursor: pointer; font-size: 13px" @click="removeSelected(c)">{{ c.name }} ×</span>
          <div v-if="selected.length > 1" class="muted" style="margin-top: 6px; font-size: 13px">已选多位客户，将生成<b>客群营销作战卡</b>（结构分布 · 批量机会 · 分层话术）</div>
        </div>
        <div v-else class="faint">尚未选择客户</div>
      </div>

      <!-- 脱敏 -->
      <div class="card card-tight row-between">
        <div>
          <div style="font-weight: 600; font-size: 14px">发送前脱敏</div>
          <div class="faint">姓名 → 张客户A，电话中间打码</div>
        </div>
        <van-switch :model-value="masked" @update:model-value="masked = $event" size="20px" />
      </div>

      <van-button round block type="primary" :loading="generating" :disabled="!selected.length && type !== 'radar'" loading-text="AI 生成中，约需十几秒…" style="margin-top: 4px" @click="generate">
        {{ type === 'radar' ? '开始全库扫描' : '生成分析报告' }}
      </van-button>

      <!-- 历史 -->
      <div class="section-title"><span>历史报告</span><span class="link" @click="loadHistory">刷新</span></div>
      <div v-for="r in history" :key="r.id" class="card card-tight" style="cursor: pointer" @click="viewReport(r)">
        <div class="row-between">
          <div class="row" style="gap: 6px">
            <span class="tag-chip amber">{{ TYPE_LABEL[r.analysis_type] || r.analysis_type }}</span>
            <span style="font-weight: 600; font-size: 14px">{{ r.customer_name }}</span>
          </div>
          <span class="faint num">{{ fmtDate(r.created_at) }}</span>
        </div>
        <div class="ellipsis muted" style="margin-top: 4px">{{ preview(r.content) }}</div>
      </div>
      <div v-if="!history.length" class="empty">
        <van-icon name="chart-trending-o" />
        还没有分析报告
      </div>
    </div>

    <!-- 客户选择弹层 -->
    <van-popup :show="pickShow" round position="bottom" style="height: 74%" @update:show="pickShow = $event">
      <div class="picker-page">
        <van-search v-model="pickQ" placeholder="搜索客户" />
        <div class="picker-list">
          <div
            v-for="item in pickFiltered"
            :key="item.id"
            class="picker-item"
            :class="{ picked: isSelected(item) }"
            @click="toggleSelected(item)"
          >
            <div>
              <div style="font-weight: 600">{{ item.name }}</div>
              <div class="faint num">{{ item.phone || '—' }} · 资产 {{ fmtMoney(item.total_assets) }}</div>
            </div>
            <van-icon :name="isSelected(item) ? 'checked' : 'circle'" :color="isSelected(item) ? '#1f3a5f' : '#c8cdd4'" style="font-size: 20px" />
          </div>
          <div v-if="!pickFiltered.length" class="empty">没有找到客户</div>
        </div>
        <div style="padding: 10px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line)">
          <van-button round block type="primary" @click="pickShow = false">确定（已选 {{ selected.length }} 人）</van-button>
        </div>
      </div>
    </van-popup>

    <ReportView :show="reportShow" :title="reportTitle" :subtitle="reportSubtitle" :content="reportContent" deletable @close="reportShow = false" @delete="deleteReport" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { showToast } from 'vant';
import { Icon as VanIcon, Button as VanButton, Switch as VanSwitch, Popup as VanPopup, Search as VanSearch } from 'vant';
import { api } from '../api/index.js';
import { fmtMoney, fmtDate } from '../utils/format.js';
import ReportView from '../components/ReportView.vue';

const TYPES = [
  { value: 'marketing', label: '营销作战卡', desc: '机会+话术+异议应对', icon: 'fire-o' },
  { value: 'radar', label: '客户雷达', desc: '挖掘隐藏商机客户', icon: 'search' },
  { value: 'profile', label: '偏好画像', desc: '行为偏好洞察', icon: 'user-o' },
  { value: 'allocation', label: '配置分析', desc: '结构/期限/风险', icon: 'chart-trending-o' },
];
const TYPE_LABEL = { profile: '偏好画像', allocation: '配置分析', marketing: '营销作战卡', portfolio: '客群营销作战卡', radar: '客户雷达' };

const route = useRoute();
const customers = ref([]);
const selected = ref([]);
const type = ref('marketing');
const masked = ref(true);
const pickShow = ref(false);
const pickQ = ref('');
const generating = ref(false);

const history = ref([]);
const reportShow = ref(false);
const reportTitle = ref('');
const reportSubtitle = ref('');
const reportContent = ref('');
const currentReport = ref(null);

const pickFiltered = computed(() => {
  const q = pickQ.value.trim();
  if (!q) return customers.value;
  return customers.value.filter((c) => c.name.includes(q) || (c.phone || '').includes(q));
});

function isSelected(c) {
  return selected.value.some((s) => s.id === c.id);
}
function toggleSelected(c) {
  selected.value = isSelected(c) ? selected.value.filter((s) => s.id !== c.id) : [...selected.value, c];
}
function removeSelected(c) {
  selected.value = selected.value.filter((s) => s.id !== c.id);
}
function openPick() {
  pickShow.value = true;
}

function preview(md) {
  return String(md || '').replace(/[#>*`\-\|]/g, '').replace(/\s+/g, ' ').slice(0, 60);
}

async function loadCustomers() {
  const data = await api.listCustomers();
  customers.value = data.list;
  // 从客户详情页跳转带入
  const pre = Number(route.query.customer);
  if (pre) {
    const c = customers.value.find((x) => x.id === pre);
    if (c) selected.value = [c];
  }
}

async function loadHistory() {
  try {
    const data = await api.listAnalysis();
    history.value = data.list;
  } catch {}
}

async function generate() {
  generating.value = true;
  try {
    const row = await api.generateAnalysis({
      customer_ids: type.value === 'radar' ? [] : selected.value.map((s) => s.id),
      type: type.value,
      masked: masked.value,
    });
    reportTitle.value = `${TYPE_LABEL[row.analysis_type] || row.analysis_type} · ${row.customer_name}`;
    reportSubtitle.value = `${fmtDate(row.created_at)} · ${row.model || ''}${row.masked ? ' · 已脱敏' : ''}`;
    reportContent.value = row.content;
    reportShow.value = true;
    loadHistory();
  } catch (e) {
    showToast(e.message);
  } finally {
    generating.value = false;
  }
}

function viewReport(r) {
  currentReport.value = r;
  reportTitle.value = `${TYPE_LABEL[r.analysis_type] || r.analysis_type} · ${r.customer_name}`;
  reportSubtitle.value = `${fmtDate(r.created_at)} · ${r.model || ''}${r.masked ? ' · 已脱敏' : ''}`;
  reportContent.value = r.content;
  reportShow.value = true;
}

async function deleteReport() {
  if (!currentReport.value) return;
  await api.deleteAnalysis(currentReport.value.id);
  reportShow.value = false;
  showToast('已删除');
  loadHistory();
}

onMounted(async () => {
  try {
    const s = await api.getSettings();
    masked.value = s.masked_enabled !== false;
  } catch {}
  loadCustomers();
  loadHistory();
});
</script>

<style scoped>
.type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.type-item {
  border: 1.5px solid var(--line);
  border-radius: 12px;
  padding: 12px 6px;
  text-align: center;
  cursor: pointer;
}
.type-item .van-icon { font-size: 20px; color: var(--ink-3); }
.type-item.active { border-color: var(--amber); background: var(--amber-soft); }
.type-item.active .van-icon { color: var(--amber); }
.picker-page { height: 100%; display: flex; flex-direction: column; }
.picker-list { flex: 1; overflow-y: auto; padding: 0 4px 8px; }
.picker-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.picker-item.picked { background: #f7f4ec; }
.picker-item:active { background: #f2efe7; }
</style>
