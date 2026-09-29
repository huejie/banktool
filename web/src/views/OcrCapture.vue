<template>
  <div class="safe-top">
    <van-nav-bar title="拍照识别" left-arrow fixed placeholder class="nav-plain" @click-left="$router.push('/')" />
    <div class="page">

      <!-- 模式选择 -->
      <div class="mode-grid">
        <div v-for="m in MODES" :key="m.value" class="mode-card" :class="{ active: mode === m.value }" @click="mode = m.value">
          <van-icon :name="m.icon" />
          <div style="font-weight: 600; font-size: 14px; margin-top: 4px">{{ m.label }}</div>
          <div class="faint" style="font-size: 11.5px">{{ m.desc }}</div>
        </div>
      </div>

      <!-- 通用模式：字段模板 -->
      <div v-if="mode === 'template'" class="card">
        <div class="faint" style="margin-bottom: 6px">要提取的字段（每行一个或逗号分隔），适配各类系统页面截图</div>
        <van-field v-model="fields" rows="3" autosize type="textarea" placeholder="客户号&#10;客户名称&#10;资产总额&#10;产品持有" />
      </div>

      <!-- 图片选择 -->
      <div class="card">
        <van-uploader
          v-model="fileList"
          multiple
          :max-count="6"
          accept="image/*"
          :before-read="beforeRead"
          upload-text="拍照 / 选图"
          :after-read="() => {}"
        />
        <div class="faint" style="margin-top: 8px" v-if="mode === 'assets'">多页表格可连拍多张，识别结果自动合并</div>
      </div>

      <van-button round block type="primary" :loading="recognizing" :disabled="!fileList.length" loading-text="识别中…" style="margin-top: 4px" @click="recognize">
        开始识别（{{ fileList.length }} 张）
      </van-button>

      <div v-if="mode !== 'assets'" class="faint" style="margin: 10px 4px">
        <van-icon name="warning-o" /> 图片将发送至智谱 AI 完成识别，请确认符合数据管理要求
      </div>

      <!-- ========== 结果确认区 ========== -->

      <!-- 名片/客户资料 -->
      <template v-if="mode === 'card' && cardForm">
        <div class="section-title">识别结果 · 核对后保存</div>
        <div class="card" style="padding: 6px 14px">
          <van-field v-model="cardForm.name" label="姓名" placeholder="姓名" required />
          <van-field v-model="cardForm.phone" label="电话" placeholder="电话" />
          <van-field v-model="cardForm.company" label="单位" placeholder="单位" />
          <van-field v-model="cardForm.title" label="职务" placeholder="职务" />
          <van-field v-model="cardForm.email" label="邮箱" placeholder="邮箱" />
          <van-field v-model="cardForm.address" label="地址" placeholder="地址" />
          <van-field v-model="cardForm.extra" label="其他" placeholder="其他信息" />
        </div>
        <div class="row" style="gap: 10px">
          <van-button round block type="primary" @click="saveCard(false)">保存为新客户</van-button>
          <van-button round block plain type="primary" @click="openCustomerPick('card')">并入已有客户</van-button>
        </div>
      </template>

      <!-- 系统截图/通用 -->
      <template v-if="mode === 'template' && kvRows.length">
        <div class="section-title">识别结果 · 核对后保存</div>
        <div class="card">
          <div v-for="(row, i) in kvRows" :key="i" class="kv-row">
            <input v-model="row.k" class="kv-k" placeholder="字段" />
            <input v-model="row.v" class="kv-v" placeholder="值" />
            <van-icon name="cross" class="kv-del" @click="kvRows.splice(i, 1)" />
          </div>
          <div class="link" style="color: var(--primary); margin-top: 6px; font-size: 13px; cursor: pointer" @click="kvRows.push({ k: '', v: '' })">＋ 添加一行</div>
        </div>
        <div class="row" style="gap: 10px">
          <van-button round block plain type="primary" @click="copyKv">复制文本</van-button>
          <van-button round block type="primary" @click="openCustomerPick('template')">保存到客户</van-button>
        </div>
      </template>

      <!-- 资产表格 -->
      <template v-if="mode === 'assets' && assetRows.length">
        <div class="section-title">识别结果 · 核对后保存（{{ assetRows.length }} 笔）</div>
        <van-field :model-value="targetCustomer ? targetCustomer.name : ''" is-link readonly label="存入客户" placeholder="选择客户" required @click="openCustomerPick('assets')" style="background: #fff; border-radius: 10px; margin-bottom: 10px" />
        <div v-for="(row, i) in assetRows" :key="i" class="card asset-edit">
          <div class="row-between" style="margin-bottom: 6px">
            <span class="faint">第 {{ i + 1 }} 笔</span>
            <van-icon name="delete-o" style="color: var(--red); font-size: 17px" @click="assetRows.splice(i, 1)" />
          </div>
          <div class="row" style="gap: 8px; flex-wrap: wrap">
            <select v-model="row.category" class="mini-select">
              <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <input v-model="row.product_name" class="mini-input grow" placeholder="产品名称" />
          </div>
          <div class="row" style="gap: 8px; margin-top: 8px">
            <input v-model.number="row.amount" class="mini-input num" type="number" inputmode="decimal" placeholder="金额" style="flex: 1" />
            <input v-model="row.rate" class="mini-input" placeholder="利率如3.2%" style="width: 110px" />
          </div>
          <div class="row" style="gap: 8px; margin-top: 8px">
            <input v-model="row.start_date" class="mini-input num" placeholder="起始 2024-01-01" style="flex: 1" />
            <input v-model="row.maturity_date" class="mini-input num" placeholder="到期 2025-01-01" style="flex: 1" />
          </div>
          <input v-model="row.notes" class="mini-input" placeholder="备注（选填）" style="margin-top: 8px; width: 100%" />
        </div>
        <van-button round block type="primary" :loading="savingAssets" @click="saveAssets">批量保存 {{ assetRows.length }} 笔资产</van-button>
      </template>

      <!-- 识别原文回看 -->
      <div v-if="rawText" class="section-title" @click="showRaw = !showRaw" style="cursor: pointer">
        <span>识别原文</span><span class="faint">{{ showRaw ? '收起' : '展开' }}</span>
      </div>
      <div v-if="showRaw && rawText" class="card faint" style="white-space: pre-wrap; font-size: 12.5px; max-height: 260px; overflow-y: auto">{{ rawText }}</div>

      <!-- 历史 -->
      <div class="section-title" @click="loadHistory" style="cursor: pointer">
        <span>识别历史</span><span class="link" @click.stop="loadHistory">刷新</span>
      </div>
      <div v-for="h in history" :key="h.id" class="card card-tight row-between" style="cursor: pointer" @click="viewHistory(h)">
        <div class="row grow" style="min-width: 0">
          <img v-if="h.image_path" :src="h.image_path" class="hist-thumb" />
          <div class="grow" style="min-width: 0">
            <span class="tag-chip amber">{{ MODE_LABEL[h.mode] || h.mode }}</span>
            <div class="faint num" style="margin-top: 3px">{{ fmtDate(h.created_at) }}</div>
          </div>
        </div>
        <van-icon name="arrow" style="color: var(--ink-3)" />
      </div>
    </div>

    <!-- 客户选择弹层 -->
    <van-popup :show="customerPick.show" round position="bottom" style="height: 70%" @update:show="(v) => (customerPick.show = v)">
      <div class="picker-page">
        <van-search v-model="customerPick.q" placeholder="搜索客户" />
        <div class="picker-list">
          <div v-for="item in pickFiltered" :key="item.id" class="picker-item" @click="choosePickCustomer(item)">
            <span>{{ item.name }}</span>
            <span class="faint num">{{ item.phone }}</span>
          </div>
          <div v-if="!pickFiltered.length" class="empty">没有找到客户</div>
        </div>
      </div>
    </van-popup>

    <!-- 历史详情弹层 -->
    <van-popup :show="historyView.show" closeable round position="bottom" style="height: 80%" @update:show="(v) => (historyView.show = v)">
      <div class="picker-page" style="padding: 16px">
        <img v-if="historyView.item?.image_path" :src="historyView.item.image_path" style="max-width: 100%; max-height: 34vh; border-radius: 10px; margin-bottom: 10px" />
        <div class="faint" style="white-space: pre-wrap; font-size: 13px; overflow-y: auto">{{ historyView.item?.raw || JSON.stringify(historyView.item?.result, null, 2) }}</div>
        <div style="margin-top: 12px">
          <van-button block plain size="small" type="danger" @click="deleteHistory">删除此记录</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { showToast, showDialog } from 'vant';
import {
  NavBar as VanNavBar, Icon as VanIcon, Field as VanField, Button as VanButton, Uploader as VanUploader,
  Popup as VanPopup, Search as VanSearch,
} from 'vant';
import { api } from '../api/index.js';
import { compressImage } from '../utils/image.js';
import { fmtDate, CATEGORIES } from '../utils/format.js';

const MODES = [
  { value: 'card', label: '名片 / 资料', desc: '提取客户基本信息', icon: 'contact' },
  { value: 'template', label: '系统截图', desc: '按自定义字段提取', icon: 'desktop-o' },
  { value: 'assets', label: '资产表格', desc: '批量导入资产记录', icon: 'balance-list-o' },
];
const MODE_LABEL = { card: '名片/资料', template: '系统截图', assets: '资产表格' };

const mode = ref('card');
const fields = ref('客户号\n客户名称\n资产总额\n产品持有');
const fileList = ref([]);
const recognizing = ref(false);
const rawText = ref('');
const showRaw = ref(false);

const cardForm = ref(null);
const kvRows = ref([]);
const assetRows = ref([]);
const savingAssets = ref(false);

const history = ref([]);
const historyView = reactive({ show: false, item: null });

const customers = ref([]);
const targetCustomer = ref(null);
const customerPick = reactive({ show: false, q: '', for: '' });

const pickFiltered = computed(() => {
  const q = customerPick.q.trim();
  if (!q) return customers.value;
  return customers.value.filter((c) => c.name.includes(q) || (c.phone || '').includes(q));
});

async function beforeRead(file) {
  if (Array.isArray(file)) return true;
  const compressed = await compressImage(file);
  return compressed instanceof File ? compressed : new File([compressed], 'photo.jpg', { type: 'image/jpeg' });
}

async function loadCustomers() {
  const data = await api.listCustomers();
  customers.value = data.list;
}

async function recognize() {
  recognizing.value = true;
  cardForm.value = null;
  kvRows.value = [];
  assetRows.value = [];
  rawText.value = '';
  try {
    const raws = [];
    for (const f of fileList.value) {
      const fd = new FormData();
      fd.append('image', f.file);
      fd.append('mode', mode.value);
      if (mode.value === 'template') fd.append('fields', fields.value);
      const r = await api.ocr(fd);
      raws.push(r);
      if (mode === 'assets' && Array.isArray(r.result)) assetRows.value.push(...r.result);
      else if (mode === 'card' && r.result && !cardForm.value) cardForm.value = { ...r.result };
      else if (mode === 'template' && r.result) {
        for (const [k, v] of Object.entries(r.result)) kvRows.value.push({ k, v: String(v ?? '') });
      }
    }
    rawText.value = raws.map((r) => r.raw).join('\n\n────\n\n');
    if (mode === 'card' && !cardForm.value) showToast('未能识别出客户信息，可展开原文查看');
    if (mode === 'template' && !kvRows.length) showToast('未能提取字段，可展开原文查看');
    if (mode === 'assets' && !assetRows.length) showToast('未能识别出资产记录，可展开原文查看');
    if (mode === 'assets') await loadCustomers();
    loadHistory();
  } catch (e) {
    showToast(e.message);
  } finally {
    recognizing.value = false;
  }
}

function openCustomerPick(forWhat) {
  if (mode.value === 'card' && !cardForm.value) return;
  if (mode.value === 'template' && !kvRows.length) return;
  customerPick.for = forWhat;
  customerPick.show = true;
  if (!customers.value.length) loadCustomers();
}

function choosePickCustomer(item) {
  customerPick.show = false;
  if (customerPick.for === 'assets') {
    targetCustomer.value = item;
    return;
  }
  if (customerPick.for === 'card') {
    const extra = [cardForm.value.email, cardForm.value.address, cardForm.value.extra].filter(Boolean).join('；');
    api.updateCustomer(item.id, {
      name: item.name, phone: item.phone, gender: item.gender, birthday: item.birthday,
      company: cardForm.value.company || item.company, title: cardForm.value.title || item.title,
      risk_level: item.risk_level, tags: item.tags, preferences: item.preferences,
      notes: [item.notes, extra].filter(Boolean).join('\n'),
    })
      .then(() => showDialog({ title: '已并入', message: `识别信息已合并到「${item.name}」` }).catch(() => {}))
      .catch((e) => showToast(e.message));
  }
  if (customerPick.for === 'template') {
    const text = kvRows.filter((r) => r.k || r.v).map((r) => `${r.k}：${r.v}`).join('\n');
    const stamp = new Date().toLocaleDateString('zh-CN');
    const notes = `${item.notes ? item.notes + '\n' : ''}[${stamp} OCR 提取]\n${text}`;
    api.updateCustomer(item.id, {
      name: item.name, phone: item.phone, gender: item.gender, birthday: item.birthday,
      company: item.company, title: item.title, risk_level: item.risk_level, tags: item.tags,
      preferences: item.preferences, notes,
    })
      .then(() => showDialog({ title: '已保存', message: `提取内容已追加到「${item.name}」的备注` }).catch(() => {}))
      .catch((e) => showToast(e.message));
  }
}

async function saveCard() {
  const f = cardForm.value;
  if (!f.name) {
    showToast('请填写姓名');
    return;
  }
  try {
    const extra = [f.email && `邮箱：${f.email}`, f.address && `地址：${f.address}`, f.extra].filter(Boolean).join('\n');
    await api.createCustomer({
      name: f.name, phone: f.phone || '', company: f.company || '', title: f.title || '',
      notes: extra || '',
    });
    await showDialog({ title: '已保存', message: `客户「${f.name}」已创建，可到详情页补充更多信息` }).catch(() => {});
    cardForm.value = null;
    fileList.value = [];
  } catch (e) {
    showToast(e.message);
  }
}

async function saveAssets() {
  if (!targetCustomer.value) {
    showToast('请先选择存入客户');
    return;
  }
  if (!assetRows.value.length) {
    showToast('没有可保存的记录');
    return;
  }
  savingAssets.value = true;
  try {
    const items = assetRows.value.map((r) => ({
      customer_id: targetCustomer.value.id,
      category: r.category || '其他',
      product_name: r.product_name || '',
      amount: Number(r.amount) || 0,
      start_date: r.start_date || '',
      maturity_date: r.maturity_date || '',
      rate: r.rate || '',
      notes: r.notes || '',
    }));
    await api.createAssets(items);
    await showDialog({ title: '已保存', message: `${items.length} 笔资产已存入「${targetCustomer.value.name}」` }).catch(() => {});
    assetRows.value = [];
    fileList.value = [];
  } catch (e) {
    showToast(e.message);
  } finally {
    savingAssets.value = false;
  }
}

async function copyKv() {
  const text = kvRows.filter((r) => r.k || r.v).map((r) => `${r.k}：${r.v}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制');
  } catch {
    showToast('复制失败，可长按原文选择复制');
  }
}

async function loadHistory() {
  try {
    const data = await api.listOcrRecords();
    history.value = data.list.slice(0, 20);
  } catch {}
}

function viewHistory(h) {
  historyView.item = h;
  historyView.show = true;
}

async function deleteHistory() {
  if (!historyView.item) return;
  await api.deleteOcrRecord(historyView.item.id);
  historyView.show = false;
  showToast('已删除');
  loadHistory();
}

loadHistory();
</script>

<style scoped>
.mode-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.mode-card {
  background: var(--card);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  padding: 12px 6px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.mode-card .van-icon { font-size: 22px; color: var(--ink-3); }
.mode-card.active { border-color: var(--primary); background: #fff; }
.mode-card.active .van-icon { color: var(--primary); }
.kv-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.kv-k { width: 108px; flex-shrink: 0; }
.kv-v { flex: 1; }
.kv-k, .kv-v {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 14px;
  background: #fff;
}
.kv-del { color: var(--ink-3); font-size: 16px; padding: 4px; cursor: pointer; }
.mini-input, .mini-select {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 14px;
  background: #fff;
  min-width: 0;
}
.mini-select { flex-shrink: 0; }
.asset-edit { padding: 10px 12px; }
.hist-thumb {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--line);
  margin-right: 10px;
  flex-shrink: 0;
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
