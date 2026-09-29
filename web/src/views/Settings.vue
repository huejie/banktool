<template>
  <div class="safe-top">
    <van-nav-bar title="设置" left-arrow fixed placeholder class="nav-plain" @click-left="$router.back()" />
    <div class="page">
      <div style="font-size: 20px; font-weight: 800; padding: 4px 2px 10px">设置</div>

      <!-- API Key -->
      <div class="section-title"><span>智谱 AI 接口</span></div>
      <div class="card" style="padding: 6px 14px 12px">
        <van-field
          v-model="form.api_key"
          :type="showKey ? 'text' : 'password'"
          label="API Key"
          :placeholder="settings.has_api_key ? `已配置（${settings.api_key_masked}），输入可覆盖` : '粘贴 open.bigmodel.cn 的 API Key'"
          :right-icon="showKey ? 'eye-o' : 'closed-eye'"
          @click-right-icon="showKey = !showKey"
        />
        <div class="row" style="gap: 10px; padding: 10px 16px 0">
          <van-button size="small" round plain type="primary" style="flex: 1" :loading="saving" @click="save">保存</van-button>
          <van-button size="small" round type="primary" style="flex: 1" :loading="testing" @click="test">测试连通</van-button>
        </div>
      </div>

      <!-- 模型 -->
      <div class="card" style="padding: 6px 14px 12px">
        <div class="faint" style="padding: 10px 16px 0">默认 glm-5.3-flash（多模态、约旗舰 1/10 价格）；分析可换 glm-5.3 获得更强质量</div>
        <van-field v-model="form.ocr_model" label="识别模型" placeholder="glm-5.3-flash" />
        <van-field v-model="form.analysis_model" label="分析模型" placeholder="glm-5.3-flash" />
        <van-field v-model="form.base_url" label="接口地址" placeholder="https://open.bigmodel.cn/api/paas/v4" />
      </div>

      <!-- 脱敏 -->
      <div class="card card-tight row-between">
        <div>
          <div style="font-weight: 600; font-size: 14px">AI 分析默认脱敏</div>
          <div class="faint">生成分析报告时对姓名、电话打码后再发送</div>
        </div>
        <van-switch :model-value="form.mask_enabled" @update:model-value="form.mask_enabled = $event" size="20px" />
      </div>

      <!-- 数据说明 -->
      <div class="card">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px">数据存储</div>
        <div class="muted" style="font-size: 13.5px; line-height: 1.7">
          全部数据（SQLite 数据库 + 识别图片）保存在服务器 <code>data/</code> 目录，不经过任何第三方；仅在识别与分析时将必要内容发送至所配置的 AI 接口。<br />
          备份：复制 <code>data/</code> 目录即可。删除：删除库文件即清空全部数据。<br />
          <b>提醒：</b>客户资金信息属敏感个人信息，请遵守所在机构数据管理规定使用本工具。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { showToast } from 'vant';
import { NavBar as VanNavBar, Field as VanField, Button as VanButton, Switch as VanSwitch } from 'vant';
import { api } from '../api/index.js';

const settings = ref({ has_api_key: false, api_key_masked: '' });
const form = reactive({ api_key: '', ocr_model: '', analysis_model: '', base_url: '', mask_enabled: true });
const showKey = ref(false);
const saving = ref(false);
const testing = ref(false);

async function load() {
  const s = await api.getSettings();
  settings.value = s;
  form.ocr_model = s.ocr_model || 'glm-5.3-flash';
  form.analysis_model = s.analysis_model || 'glm-5.3-flash';
  form.base_url = s.base_url || 'https://open.bigmodel.cn/api/paas/v4';
  form.mask_enabled = s.mask_enabled !== false;
}

async function save() {
  saving.value = true;
  try {
    await api.saveSettings({ ...form, api_key: form.api_key.trim() || undefined });
    showToast('已保存');
    form.api_key = '';
    await load();
  } catch (e) {
    showToast(e.message);
  } finally {
    saving.value = false;
  }
}

async function test() {
  testing.value = true;
  try {
    if (form.api_key.trim()) {
      await api.saveSettings({ api_key: form.api_key.trim() });
      form.api_key = '';
    }
    const r = await api.testSettings();
    showToast(`连通正常（${r.reply || 'ok'}）`);
    await load();
  } catch (e) {
    showToast(`失败：${e.message}`);
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>
