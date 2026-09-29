<template>
  <van-popup :show="show" closeable position="bottom" round style="height: 86%" teleport="body" @update:show="emitClose">
    <div class="report-popup">
      <div class="report-header">
        <div class="report-title ellipsis">{{ title }}</div>
        <div class="faint">{{ subtitle }}</div>
      </div>
      <div class="report-scroll">
        <div class="markdown-body" v-html="html"></div>
      </div>
      <div class="report-footer" v-if="deletable">
        <van-button block plain type="danger" size="small" @click="onDelete">删除此报告</van-button>
      </div>
    </div>
  </van-popup>
</template>

<script setup>
import { computed } from 'vue';
import { Popup as VanPopup, Button as VanButton, showConfirmDialog, showToast } from 'vant';
import { renderMarkdown } from '../utils/markdown.js';

const props = defineProps({
  show: Boolean,
  title: { type: String, default: 'AI 分析报告' },
  subtitle: { type: String, default: '' },
  content: { type: String, default: '' },
  deletable: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'delete']);

const html = computed(() => renderMarkdown(props.content));

function emitClose(v) {
  if (!v) emit('close');
}
function onDelete() {
  showConfirmDialog({ title: '删除报告', message: '删除后不可恢复，确定吗？' })
    .then(() => emit('delete'))
    .catch(() => {});
}
</script>

<style scoped>
.report-popup {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 18px calc(14px + env(safe-area-inset-bottom));
}
.report-header { padding: 2px 34px 10px 2px; border-bottom: 1px solid var(--line); }
.report-title { font-size: 16px; font-weight: 700; }
.report-scroll { flex: 1; overflow-y: auto; padding-top: 12px; }
.report-footer { padding-top: 10px; border-top: 1px solid var(--line); }
</style>
