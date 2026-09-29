<template>
  <div class="safe-top">
    <van-nav-bar :title="isEdit ? '编辑产品' : '新增产品'" left-arrow fixed placeholder class="nav-plain" @click-left="$router.back()" />
    <div class="page">
      <van-form class="card" style="padding: 6px 14px" @submit="save">
        <van-field v-model="form.name" label="产品名称" placeholder="如：安享90天固收增强" required :rules="[{ required: true, message: '请填写产品名称' }]" />
        <van-field v-model="form.category" is-link readonly label="类别" placeholder="选择类别" @click="showCategory = true" />
        <van-field v-model="form.code" label="产品代码" placeholder="选填" />
        <van-field v-model="form.risk_level" is-link readonly label="风险等级" placeholder="R1-R5" @click="showRisk = true" />
        <van-field v-model="form.expected_rate" label="参考利率/基准" placeholder="如 2.6% 或 2.1%-2.8%" />
        <van-field v-model="form.term" label="期限" placeholder="如 90天 / 1年 / 36个月" />
        <van-field v-model="form.min_amount" label="起购金额（元）" type="number" inputmode="decimal" placeholder="0" />
        <van-field v-model="form.highlights" rows="2" autosize type="textarea" label="卖点" placeholder="一句话卖点，AI 推荐时会引用" />
        <van-field v-model="form.notes" rows="2" autosize type="textarea" label="备注" placeholder="选填" />
        <van-field label="在售" label-width="64px">
          <template #input>
            <van-switch :model-value="form.is_active" size="20px" @update:model-value="form.is_active = $event" />
          </template>
        </van-field>
        <div style="padding: 12px 16px 8px">
          <van-button round block type="primary" native-type="submit" :loading="saving">保存</van-button>
        </div>
      </van-form>
    </div>

    <van-popup :show="showCategory" round position="bottom" @update:show="showCategory = $event">
      <van-picker :columns="CATEGORIES" @confirm="({ selectedValues }) => { form.category = selectedValues[0]; showCategory = false; }" @cancel="showCategory = false" />
    </van-popup>
    <van-popup :show="showRisk" round position="bottom" @update:show="showRisk = $event">
      <van-picker :columns="RISK_LEVELS_PRODUCT" @confirm="({ selectedValues }) => { form.risk_level = selectedValues[0]; showRisk = false; }" @cancel="showRisk = false" />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import {
  NavBar as VanNavBar, Form as VanForm, Field as VanField, Button as VanButton, Popup as VanPopup, Picker as VanPicker, Switch as VanSwitch,
} from 'vant';
import { api } from '../api/index.js';
import { CATEGORIES } from '../utils/format.js';

const RISK_LEVELS_PRODUCT = ['R1 谨慎型', 'R2 稳健型', 'R3 平衡型', 'R4 进取型', 'R5 激进型'];

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => Boolean(route.params.id));

const form = reactive({ name: '', category: '理财', code: '', risk_level: '', expected_rate: '', term: '', min_amount: '', highlights: '', notes: '', is_active: true });
const showCategory = ref(false);
const showRisk = ref(false);
const saving = ref(false);

async function load() {
  if (!isEdit.value) return;
  try {
    const data = await api.listProducts({ include_inactive: '1' });
    const p = data.list.find((x) => x.id === Number(route.params.id));
    if (!p) {
      showToast('产品不存在');
      router.back();
      return;
    }
    Object.assign(form, { ...p, min_amount: p.min_amount ? String(p.min_amount) : '', is_active: Boolean(p.is_active) });
  } catch (e) {
    showToast(e.message);
  }
}

async function save() {
  saving.value = true;
  try {
    const payload = { ...form, min_amount: Number(form.min_amount) || 0 };
    if (isEdit.value) await api.updateProduct(route.params.id, payload);
    else await api.createProduct(payload);
    showToast('已保存');
    router.back();
  } catch (e) {
    showToast(e.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
