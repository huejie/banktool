<template>
  <div class="login-page safe-top">
    <div class="login-box">
      <img src="/icon.svg" class="logo" alt="客户簿" />
      <div class="title">客户簿</div>
      <div class="muted" style="margin-bottom: 22px; font-size: 13.5px">
        {{ isSetup ? '首次使用，请设置访问密码' : '银行客户信息管理 · 私人工具' }}
      </div>

      <van-field
        v-model="password"
        type="password"
        :placeholder="isSetup ? '设置访问密码（至少 4 位）' : '请输入访问密码'"
        center
        style="background: #fff; border-radius: 10px; margin-bottom: 12px"
        @keyup.enter="submit"
      />
      <van-field
        v-if="isSetup"
        v-model="confirm"
        type="password"
        placeholder="再输入一遍确认"
        center
        style="background: #fff; border-radius: 10px; margin-bottom: 12px"
      />
      <van-button round block type="primary" :loading="loading" @click="submit">
        {{ isSetup ? '设置并进入' : '进入' }}
      </van-button>
      <div v-if="hint" :class="['faint', 'hint']">{{ hint }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Field as VanField, Button as VanButton } from 'vant';

const router = useRouter();
const password = ref('');
const confirm = ref('');
const loading = ref(false);
const isSetup = ref(false);
const hint = ref('');

onMounted(async () => {
  try {
    const res = await fetch('/api/auth/status');
    const s = await res.json();
    if (s.authed) {
      router.replace('/');
      return;
    }
    isSetup.value = !s.has_password;
    if (isSetup.value) hint.value = '设置后每台设备登录一次即可，30 天免登录';
  } catch {}
});

async function submit() {
  if (loading.value) return;
  const pw = password.value.trim();
  if (!pw) return;
  if (isSetup.value && pw !== confirm.value) {
    hint.value = '两次输入不一致';
    return;
  }
  loading.value = true;
  hint.value = '';
  try {
    const res = await fetch(isSetup.value ? '/api/auth/setup' : '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) {
      hint.value = data.error || '操作失败';
      return;
    }
    router.replace('/');
  } catch {
    hint.value = '网络错误，请重试';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper);
  padding: 24px;
}
.login-box {
  width: 100%;
  max-width: 340px;
  text-align: center;
}
.logo { width: 72px; height: 72px; border-radius: 18px; }
.title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.06em;
  margin-top: 12px;
  color: var(--primary);
}
.hint { margin-top: 12px; }
</style>
