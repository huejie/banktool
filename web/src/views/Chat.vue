<template>
  <div class="safe-top chat-page">
    <!-- 顶栏 -->
    <div class="chat-header">
      <van-icon name="arrow-left" style="font-size: 20px; color: var(--ink); padding: 6px" @click="$router.push('/')" />
      <div class="grow" style="text-align: center">
        <div style="font-size: 17px; font-weight: 800">AI 对话</div>
        <div class="faint" style="font-size: 11.5px">{{ streaming ? '回复中…' : '口述记录 / 问客户 / 聊业务' }}</div>
      </div>
      <van-icon name="delete-o" style="font-size: 20px; color: var(--ink-2); padding: 6px" @click="clearAll" />
    </div>

    <!-- 关联条 -->
    <div class="link-bar" @click="showLinkSheet = true">
      <van-icon :name="linkIcon" :color="linkColor" style="font-size: 15px" />
      <span class="ellipsis" style="flex: 1">{{ linkText }}</span>
      <span class="faint">切换 ▾</span>
    </div>

    <!-- 消息流 -->
    <div class="msg-scroll" ref="scrollEl">
      <div v-if="!messages.length" class="empty" style="padding: 36px 20px">
        <van-icon name="chat-o" />
        说说今天拜访的情况，或问一句"稳健型客户都有谁"<br />
        <span class="faint">涉及客户的消息可自动归档到对应客户档案</span>
      </div>

      <div v-for="(m, i) in messages" :key="m.id || m.localId" class="msg-row" :class="m.role">
        <!-- 用户消息：只留轻量状态标签；操作按钮统一放在其后的 AI 回答下方（AI 未回复时在此兜底） -->
        <div v-if="m.role === 'user'" class="msg user">
          <div class="msg-body">{{ m.content }}</div>
          <div v-if="m.customer_name && !m.applied" class="msg-meta"><span class="archive-tag">已归档 · {{ m.customer_name }}</span></div>
          <div v-else-if="!hasReplyAfter(i)" class="msg-meta">
            <span v-if="extProduct(m) && !m.applied" class="archive-action" @click="applyProduct(m)">📦 存入产品库「{{ extProduct(m).name }}」</span>
            <span v-else-if="extInfo(m) && !m.applied" class="archive-action" @click="applyExtracted(m)">{{ applyButtonLabel(m) }}</span>
            <span v-else-if="m.suggest_new" class="archive-action" @click="createAndAssign(m)">＋ 新建客户「{{ m.suggest_new }}」并归档</span>
          </div>
        </div>

        <!-- AI 消息：回答结束后，下方挂"存入档案"等操作（对应上一条用户消息） -->
        <div v-else class="msg ai">
          <div class="msg-body markdown-body" v-html="renderMarkdown(m.content || '')"></div>
          <div v-if="m.streaming" class="cursor">▍</div>
          <template v-if="!m.streaming && prevUser(i)">
            <div v-if="extProduct(prevUser(i)) && !prevUser(i).applied" class="msg-meta ai-meta">
              <span class="archive-action" @click="applyProduct(prevUser(i))">📦 存入产品库「{{ extProduct(prevUser(i)).name }}」</span>
            </div>
            <div v-if="extInfo(prevUser(i)) && !prevUser(i).applied" class="msg-meta ai-meta">
              <span class="archive-action" @click="applyExtracted(prevUser(i))">{{ applyButtonLabel(prevUser(i)) }}</span>
            </div>
            <div v-if="!extProduct(prevUser(i)) && !extInfo(prevUser(i)) && prevUser(i).suggest_new && !prevUser(i).customer_id" class="msg-meta ai-meta">
              <span class="archive-action" @click="createAndAssign(prevUser(i))">＋ 新建客户「{{ prevUser(i).suggest_new }}」并归档</span>
            </div>
            <div v-if="prevUser(i).applied" class="msg-meta ai-meta">
              <span class="archive-tag">已存入 · {{ prevUser(i).customer_name || '产品库' }}</span>
            </div>
            <div v-if="!prevUser(i).applied && prevUser(i).customer_name" class="msg-meta ai-meta">
              <span class="archive-tag">已归档 · {{ prevUser(i).customer_name }}</span>
            </div>
            <div v-if="!prevUser(i).applied && !extProduct(prevUser(i)) && !extInfo(prevUser(i)) && !prevUser(i).suggest_new && !prevUser(i).customer_name" class="msg-meta ai-meta">
              <span class="archive-action plain" @click="assignExisting(prevUser(i))">归档此条…</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 语音中间态提示 -->
    <div v-if="listening && pendingText" class="pending-bar">
      <van-icon name="volume-o" style="color: var(--red)" /> 正在识别：{{ pendingText }}
    </div>

    <!-- 输入区 -->
    <div class="input-bar">
      <button
        class="mic-btn"
        :class="{ listening }"
        :disabled="!speechOk"
        @click="toggleMic"
      >
        <van-icon :name="listening ? 'pause-circle-o' : 'volume-o'" />
      </button>
      <textarea
        ref="inputEl"
        v-model="text"
        rows="1"
        placeholder="说话或打字…（Enter 换行）"
        @input="autoGrow"
      ></textarea>
      <button class="send-btn" :disabled="!text.trim() || streaming" @click="send">
        <van-icon name="arrow-up" />
      </button>
    </div>
    <div v-if="!speechOk" class="faint mic-hint">💡 语音速记：点击键盘上的 🎤 语音键说话，文字直接进输入框（输入法自带，不受访问方式限制）</div>

    <!-- 关联模式弹层 -->
    <van-action-sheet
      :show="showLinkSheet"
      :actions="linkActions"
      cancel-text="取消"
      close-on-click-action
      @select="onLinkSelect"
      @cancel="showLinkSheet = false"
      @update:show="showLinkSheet = $event"
    />
    <!-- 选择客户弹层 -->
    <van-popup :show="showCustomerPick" round position="bottom" style="height: 70%" @update:show="showCustomerPick = $event">
      <div class="picker-page">
        <van-search v-model="pickQ" placeholder="搜索客户" />
        <div class="picker-list">
          <div v-for="item in pickFiltered" :key="item.id" class="picker-item" @click="linkCustomer(item)">
            <span>{{ item.name }}</span>
            <span class="faint num">{{ item.phone }}</span>
          </div>
          <div v-if="!pickFiltered.length" class="empty">没有找到客户</div>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { showToast, showConfirmDialog, showDialog } from 'vant';
import {
  Icon as VanIcon, ActionSheet as VanActionSheet, Popup as VanPopup, Search as VanSearch,
} from 'vant';
import { api } from '../api/index.js';
import { renderMarkdown } from '../utils/markdown.js';
import { speechSupported, createRecognizer } from '../utils/speech.js';

const messages = ref([]);
const text = ref('');
const streaming = ref(false);
const scrollEl = ref(null);
const inputEl = ref(null);
const route = useRoute();

// 关联模式：auto = AI 自动识别归档；none = 纯聊天；customer = 固定关联某客户
const linkMode = ref('auto');
const linkedCustomer = ref(null);
const showLinkSheet = ref(false);
const showCustomerPick = ref(false);
const customers = ref([]);
const pickQ = ref('');

const linkActions = [
  { name: 'AI 自动识别归档（推荐）', value: 'auto' },
  { name: '不关联，纯聊天', value: 'none' },
  { name: '关联指定客户…', value: 'customer' },
];

const linkText = computed(() => {
  if (linkMode.value === 'customer' && linkedCustomer.value) return `本段对话关联：${linkedCustomer.value.name}`;
  if (linkMode.value === 'none') return '不关联（纯聊天）';
  return 'AI 自动识别客户并归档';
});
const linkIcon = computed(() => (linkMode.value === 'customer' ? 'bookmark-o' : linkMode.value === 'none' ? 'chat-o' : 'bulb-o'));
const linkColor = computed(() => (linkMode.value === 'customer' ? 'var(--primary)' : linkMode.value === 'none' ? 'var(--ink-3)' : 'var(--amber)'));

const pickFiltered = computed(() => {
  const q = pickQ.value.trim();
  if (!q) return customers.value;
  return customers.value.filter((c) => c.name.includes(q) || (c.phone || '').includes(q));
});

// ===== 语音 =====
const speechOk = speechSupported();
const listening = ref(false);
const pendingText = ref('');
let recognizer = null;

function toggleMic() {
  if (listening.value) {
    recognizer?.stop();
    return;
  }
  try {
    recognizer = createRecognizer({
      onFinal: (t) => {
        text.value = (text.value ? text.value : '') + t;
        pendingText.value = '';
        nextTick(autoGrow);
      },
      onPartial: (t) => (pendingText.value = t),
      onEnd: () => {
        listening.value = false;
        pendingText.value = '';
      },
      onError: (err) => {
        showToast(err === 'not-allowed' ? '麦克风权限被拒绝，请在浏览器设置中允许' : `语音识别出错：${err}`);
      },
    });
    recognizer.start();
    listening.value = true;
  } catch (e) {
    showToast('无法启动语音识别');
  }
}

function autoGrow() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 110) + 'px';
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
  });
}

// ===== 发送（SSE 流式） =====
async function send() {
  const content = text.value.trim();
  if (!content || streaming.value) return;
  text.value = '';
  nextTick(autoGrow);

  const localId = `local-${Date.now()}`;
  const userMsg = { localId, role: 'user', content, customer_id: null, customer_name: null, suggest_new: '' };
  const aiMsg = { localId: `${localId}-ai`, role: 'assistant', content: '', streaming: true };
  messages.value.push(userMsg, aiMsg);
  scrollToBottom();
  streaming.value = true;

  try {
    const res = await api.sendChat({
      content,
      customer_id: linkMode.value === 'customer' && linkedCustomer.value ? linkedCustomer.value.id : null,
      match: linkMode.value === 'auto',
    });
    if (!res.ok || !res.body) {
      if (res.status === 401) {
        location.href = '/login';
        throw new Error('登录已过期');
      }
      let msg = `请求失败（${res.status}）`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {}
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (evt.meta) {
          if (evt.meta.user_message_id) userMsg.id = evt.meta.user_message_id;
          if (evt.meta.matched_customer) {
            userMsg.customer_id = evt.meta.matched_customer.id;
            userMsg.customer_name = evt.meta.matched_customer.name;
            aiMsg.customer_id = userMsg.customer_id;
            aiMsg.customer_name = userMsg.customer_name;
          }
          if (evt.meta.suggest_new) userMsg.suggest_new = evt.meta.suggest_new;
          if (evt.meta.extracted) userMsg.extracted = evt.meta.extracted;
          if (evt.meta.match_error) showToast(`归档识别失败：${evt.meta.match_error}`);
        } else if (evt.delta) {
          aiMsg.content += evt.delta;
          scrollToBottom();
        } else if (evt.error) {
          throw new Error(evt.error);
        } else if (evt.done) {
          aiMsg.id = evt.message_id;
        }
      }
    }
    if (!aiMsg.content) aiMsg.content = '（AI 未返回内容）';
  } catch (e) {
    aiMsg.content = aiMsg.content || `⚠️ ${e.message}`;
    showToast(e.message);
  } finally {
    aiMsg.streaming = false;
    streaming.value = false;
    scrollToBottom();
  }
}

// ===== 消息配对辅助：AI 回答下方的按钮对应其前一条用户消息 =====
function prevUser(i) {
  const p = messages.value[i - 1];
  return p && p.role === 'user' ? p : null;
}
function hasReplyAfter(i) {
  const n = messages.value[i + 1];
  return Boolean(n && n.role === 'assistant');
}
// extracted 兼容新旧两种格式：新 {info, product}；旧（直接是 info 对象）
function extInfo(m) {
  if (!m?.extracted) return null;
  return m.extracted.info || (m.extracted.product ? null : m.extracted);
}
function extProduct(m) {
  return m?.extracted?.product || null;
}

// ===== 归档操作 =====
function applyButtonLabel(m) {
  if (m.customer_id) return '📋 存入档案';
  if (m.suggest_new) return `📋 新建「${m.suggest_new}」并存入档案`;
  return '📋 存入到客户档案…';
}

async function applyProduct(m) {
  try {
    const r = await api.applyChat(m.id, { product: extProduct(m), customer_id: m.customer_id || undefined });
    m.applied = true;
    if (!m.customer_name) m.customer_name = '';
    await showDialog({
      title: '已存入产品库',
      message: `「${r.product_name}」已入库，营销作战卡和对话推荐将自动引用它`,
    }).catch(() => {});
  } catch (e) {
    showToast(e.message);
  }
}

async function applyExtracted(m) {
  try {
    let customerId = m.customer_id;
    if (!customerId && m.suggest_new) {
      const created = await api.createCustomer({ name: m.suggest_new, notes: '' });
      customerId = created.id;
    }
    if (!customerId) {
      // 未确定归属：打开客户选择，选中后回调
      pendingApply = m;
      if (!customers.value.length) await loadCustomers();
      showCustomerPick.value = true;
      return;
    }
    await doApply(m, customerId);
  } catch (e) {
    showToast(e.message);
  }
}

async function doApply(m, customerId) {
  const r = await api.applyChat(m.id, { customer_id: customerId, info: extInfo(m) });
  m.applied = true;
  m.customer_id = customerId;
  m.customer_name = r.customer_name;
  m.suggest_new = '';
  const idx = messages.value.indexOf(m);
  const nextMsg = messages.value[idx + 1];
  if (nextMsg && nextMsg.role === 'assistant') {
    nextMsg.customer_id = customerId;
    nextMsg.customer_name = r.customer_name;
  }
  await showDialog({
    title: '已存入档案',
    message: `「${r.customer_name}」${r.summary || '已更新'}${r.assets_added ? `\n可在客户详情或表格页查看资产` : ''}`,
  }).catch(() => {});
}

let pendingApply = null;

async function createAndAssign(m) {
  try {
    const created = await api.createCustomer({ name: m.suggest_new, notes: '' });
    await api.assignChatMessage(m.id, created.id);
    m.customer_id = created.id;
    m.customer_name = created.name;
    m.suggest_new = '';
    // 后端同时归档了紧随的 assistant 回复
    const idx = messages.value.indexOf(m);
    const nextMsg = messages.value[idx + 1];
    if (nextMsg && nextMsg.role === 'assistant') {
      nextMsg.customer_id = created.id;
      nextMsg.customer_name = created.name;
    }
    await showDialog({ title: '已归档', message: `已新建客户「${created.name}」并归档本条消息，可到客户详情补充资料` }).catch(() => {});
  } catch (e) {
    showToast(e.message);
  }
}

function assignExisting(m) {
  showCustomerPick.value = true;
  pendingAssign = m;
}
let pendingAssign = null;

async function loadCustomers() {
  const data = await api.listCustomers();
  customers.value = data.list;
}

// ===== 关联选择 =====
function onLinkSelect(action) {
  showLinkSheet.value = false;
  if (action.value === 'customer') {
    pendingAssign = null;
    if (!customers.value.length) loadCustomers();
    showCustomerPick.value = true;
    return;
  }
  linkMode.value = action.value;
  if (action.value !== 'customer') linkedCustomer.value = null;
}

function linkCustomer(item) {
  showCustomerPick.value = false;
  if (pendingApply) {
    const m = pendingApply;
    pendingApply = null;
    doApply(m, item.id).catch((e) => showToast(e.message));
    return;
  }
  if (pendingAssign) {
    // 从消息上手动归档
    api.assignChatMessage(pendingAssign.id, item.id)
      .then(() => {
        pendingAssign.customer_id = item.id;
        pendingAssign.customer_name = item.name;
        showToast(`已归档到「${item.name}」`);
        pendingAssign = null;
      })
      .catch((e) => showToast(e.message));
    return;
  }
  linkedCustomer.value = item;
  linkMode.value = 'customer';
}

async function clearAll() {
  showConfirmDialog({ title: '清空对话', message: '将删除全部对话记录（不影响已归档到客户档案的内容），确定吗？' })
    .then(async () => {
      await api.clearChat();
      messages.value = [];
    })
    .catch(() => {});
}

async function loadHistory() {
  try {
    const data = await api.listChatMessages({ limit: 100 });
    messages.value = data.list;
    scrollToBottom();
  } catch (e) {
    showToast(e.message);
  }
}

onMounted(async () => {
  // 从客户详情「对话速记」进入：预关联该客户
  const pre = Number(route.query.customer);
  if (pre) {
    try {
      const data = await api.listCustomers();
      customers.value = data.list;
      const c = customers.value.find((x) => x.id === pre);
      if (c) {
        linkedCustomer.value = c;
        linkMode.value = 'customer';
      }
    } catch {}
  } else {
    loadCustomers();
  }
  loadHistory();
});

onBeforeUnmount(() => {
  try {
    recognizer?.stop();
  } catch {}
});
</script>

<style scoped>
.chat-page { display: flex; flex-direction: column; height: 100vh; }
.chat-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 10px 6px;
}
.link-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 14px 8px;
  padding: 8px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 13px;
  color: var(--ink-2);
  cursor: pointer;
}
.msg-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 14px 12px;
  -webkit-overflow-scrolling: touch;
}
.msg-row { display: flex; margin-bottom: 12px; }
.msg-row.user { justify-content: flex-end; }
.msg { max-width: 86%; }
.msg.user .msg-body {
  background: var(--primary);
  color: #f7f4ec;
  border-radius: 14px 2px 14px 14px;
  padding: 9px 12px;
  font-size: 14.5px;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.ai .msg-body {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 2px 14px 14px 14px;
  padding: 10px 13px;
  font-size: 14px;
}
.msg-meta { margin-top: 4px; font-size: 12px; text-align: right; }
.msg-row.user .msg-meta { text-align: right; }
.msg-row.assistant-row .msg-meta { text-align: left; }
.archive-tag { color: var(--green); background: #eaf5ee; border-radius: 6px; padding: 1px 8px; }
.archive-action {
  color: var(--amber);
  background: var(--amber-soft);
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
}
.archive-action.plain { color: var(--ink-3); background: #f0eee8; }
.msg-meta.ai-meta { text-align: left; }
.pending-bar {
  margin: 0 14px 6px;
  padding: 7px 12px;
  background: var(--amber-soft);
  border-radius: 10px;
  font-size: 13px;
  color: var(--amber);
}
.input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  background: #fffdf9;
  border-top: 1px solid var(--line);
}
.input-bar textarea {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-family: inherit;
  line-height: 1.5;
  max-height: 110px;
  padding: 8px 4px;
  resize: none;
}
.mic-btn, .send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
  cursor: pointer;
}
.mic-btn {
  background: var(--amber-soft);
  color: var(--amber);
}
.mic-btn.listening {
  background: var(--red);
  color: #fff;
  animation: pulse 1.2s ease-in-out infinite;
}
.mic-btn:disabled { opacity: 0.35; }
.send-btn {
  background: var(--primary);
  color: #fff;
}
.send-btn:disabled { opacity: 0.4; }
.mic-hint {
  text-align: center;
  padding: 0 12px calc(6px + env(safe-area-inset-bottom));
  background: #fffdf9;
  font-size: 11.5px;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
.cursor {
  display: inline-block;
  color: var(--primary);
  animation: blink 0.9s step-start infinite;
}
@keyframes blink { 50% { opacity: 0; } }
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
