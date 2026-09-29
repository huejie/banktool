<template>
  <div class="safe-top">
    <van-nav-bar :title="isEdit ? '编辑客户' : '新建客户'" left-arrow fixed placeholder @click-left="$router.back()" class="nav-plain" />
    <div class="page">
      <van-form class="card" style="padding: 6px 14px" @submit="save">
        <van-field v-model="form.name" label="姓名" placeholder="必填" required :rules="[{ required: true, message: '请填写姓名' }]" />
        <van-field v-model="form.phone" label="电话" type="tel" placeholder="选填" />
        <van-field v-model="form.gender" is-link readonly label="性别" placeholder="选填" @click="showGender = true" />
        <van-field v-model="form.birthday" is-link readonly label="生日" placeholder="选填" @click="showBirthday = true" />
        <van-field v-model="form.company" label="单位" placeholder="选填" />
        <van-field v-model="form.title" label="职务" placeholder="选填" />
        <van-field v-model="form.risk_level" is-link readonly label="风险等级" placeholder="选填" @click="showRisk = true" />

        <div style="padding: 10px 16px 4px" class="faint">偏好标签（点击快选或输入后回车）</div>
        <div style="padding: 0 16px 8px">
          <span v-for="t in form.tags" :key="t" class="tag-chip" style="cursor: pointer; font-size: 13px" @click="removeTag(t)">{{ t }} ×</span>
          <span v-if="!form.tags.length" class="faint">暂无标签</span>
        </div>
        <van-field v-model="tagInput" label=" " label-width="16px" placeholder="输入标签后回车添加" @keyup.enter="addTag" />
        <div style="padding: 4px 16px 12px">
          <span v-for="t in QUICK_TAGS.filter((x) => !form.tags.includes(x))" :key="t" class="tag-chip plain" style="cursor: pointer" @click="form.tags.push(t)">＋ {{ t }}</span>
        </div>

        <van-field v-model="form.preferences" rows="2" autosize type="textarea" label="偏好描述" placeholder="如：偏好稳健产品，关注黄金和储蓄国债，忌谈股票…" />
        <van-field v-model="form.notes" rows="2" autosize type="textarea" label="备注" placeholder="选填" />
        <div style="padding: 12px 16px 8px">
          <van-button round block type="primary" native-type="submit" :loading="saving">保存</van-button>
        </div>
      </van-form>
    </div>

    <van-popup :show="showGender" round position="bottom" @update:show="showGender = $event">
      <van-picker :columns="['男', '女']" @confirm="({ selectedValues }) => { form.gender = selectedValues[0]; showGender = false; }" @cancel="showGender = false" />
    </van-popup>
    <van-popup :show="showRisk" round position="bottom" @update:show="showRisk = $event">
      <van-picker :columns="RISK_LEVELS" @confirm="({ selectedValues }) => { form.risk_level = selectedValues[0]; showRisk = false; }" @cancel="showRisk = false" />
    </van-popup>
    <van-popup :show="showBirthday" round position="bottom" @update:show="showBirthday = $event">
      <van-date-picker
        :model-value="birthdayValue"
        :min-date="new Date(1930, 0, 1)"
        :max-date="new Date()"
        title="选择生日"
        @confirm="({ selectedValues }) => { form.birthday = selectedValues.join('-'); showBirthday = false; }"
        @cancel="showBirthday = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import {
  NavBar as VanNavBar, Form as VanForm, Field as VanField, Button as VanButton,
  Popup as VanPopup, Picker as VanPicker, DatePicker as VanDatePicker,
} from 'vant';
import { api } from '../api/index.js';
import { RISK_LEVELS } from '../utils/format.js';

const QUICK_TAGS = ['稳健型', '存款', '理财', '基金', '保险', '黄金', '国债', '养老', '子女教育', '房产', '权益类', '私募'];

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => Boolean(route.params.id));

const form = reactive({ name: '', phone: '', gender: '', birthday: '', company: '', title: '', risk_level: '', tags: [], preferences: '', notes: '' });
const tagInput = ref('');
const saving = ref(false);
const showGender = ref(false);
const showRisk = ref(false);
const showBirthday = ref(false);

const birthdayValue = computed(() => {
  if (!form.birthday) return [];
  const [y, m, d] = form.birthday.split('-').map(Number);
  return [y, m, d].every(Number.isFinite) ? [y, m, d] : [];
});

function addTag() {
  const t = tagInput.value.trim();
  if (t && !form.tags.includes(t)) form.tags.push(t);
  tagInput.value = '';
}
function removeTag(t) {
  form.tags = form.tags.filter((x) => x !== t);
}

async function load() {
  if (!isEdit.value) return;
  try {
    const data = await api.getCustomer(route.params.id);
    Object.assign(form, { ...data, assets: undefined, analyses: undefined });
  } catch (e) {
    showToast(e.message);
    router.back();
  }
}

async function save() {
  saving.value = true;
  try {
    if (isEdit.value) {
      await api.updateCustomer(route.params.id, { ...form });
      showToast('已保存');
      router.replace(`/customer/${route.params.id}`);
    } else {
      const created = await api.createCustomer({ ...form });
      showToast('已创建');
      router.replace(`/customer/${created.id}`);
    }
  } catch (e) {
    showToast(e.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
