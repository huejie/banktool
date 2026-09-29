<template>
  <div class="safe-top">
    <van-nav-bar :title="isEdit ? '编辑资产' : '新增资产'" left-arrow fixed placeholder class="nav-plain" @click-left="$router.back()" />
    <div class="page">
      <van-form class="card" style="padding: 6px 14px" @submit="save">
        <van-field v-model="customerName" is-link readonly label="所属客户" placeholder="选择客户" required :rules="[{ required: true, message: '请选择客户' }]" @click="showCustomer = true" />
        <van-field v-model="form.category" is-link readonly label="类别" placeholder="选择类别" @click="showCategory = true" />
        <van-field v-model="form.product_name" label="产品名称" placeholder="如：安心赢90天" />
        <van-field v-model="form.amount" label="金额（元）" type="number" inputmode="decimal" placeholder="0.00" />
        <van-field v-model="form.rate" label="参考利率" placeholder="如 3.25% 或 2.1%-2.8%" />
        <van-field v-model="form.start_date" is-link readonly label="起始日" placeholder="选填" @click="pickDate = 'start_date'" />
        <van-field v-model="form.maturity_date" is-link readonly label="到期日" placeholder="选填" @click="pickDate = 'maturity_date'" />
        <van-field v-model="form.notes" rows="2" autosize type="textarea" label="备注" placeholder="选填" />
        <div style="padding: 12px 16px 8px">
          <van-button round block type="primary" native-type="submit" :loading="saving">保存</van-button>
        </div>
      </van-form>
    </div>

    <van-popup :show="showCustomer" round position="bottom" style="height: 70%" @update:show="showCustomer = $event">
      <div class="picker-page">
        <van-search v-model="customerQuery" placeholder="搜索客户" />
        <div class="picker-list">
          <div v-for="item in filteredCustomers" :key="item.id" class="picker-item" @click="chooseCustomer(item)">
            <span>{{ item.name }}</span>
            <span class="faint num">{{ item.phone }}</span>
          </div>
          <div v-if="!filteredCustomers.length" class="empty">没有找到客户</div>
        </div>
      </div>
    </van-popup>

    <van-popup :show="showCategory" round position="bottom" @update:show="showCategory = $event">
      <van-picker :columns="CATEGORIES" @confirm="({ selectedValues }) => { form.category = selectedValues[0]; showCategory = false; }" @cancel="showCategory = false" />
    </van-popup>

    <van-popup :show="pickDate !== ''" round position="bottom" @update:show="(v) => { if (!v) pickDate = ''; }">
      <van-date-picker
        title="选择日期"
        @confirm="({ selectedValues }) => { form[pickDate] = selectedValues.join('-'); pickDate = ''; }"
        @cancel="pickDate = ''"
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
  Popup as VanPopup, Picker as VanPicker, DatePicker as VanDatePicker, Search as VanSearch,
} from 'vant';
import { api } from '../api/index.js';
import { CATEGORIES } from '../utils/format.js';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => Boolean(route.params.id));

const form = reactive({ customer_id: null, category: '理财', product_name: '', amount: '', rate: '', start_date: '', maturity_date: '', notes: '' });
const customers = ref([]);
const customerName = ref('');
const customerQuery = ref('');
const showCustomer = ref(false);
const showCategory = ref(false);
const pickDate = ref('');
const saving = ref(false);

const filteredCustomers = computed(() => {
  const q = customerQuery.value.trim();
  if (!q) return customers.value;
  return customers.value.filter((c) => c.name.includes(q) || (c.phone || '').includes(q));
});

function chooseCustomer(item) {
  form.customer_id = item.id;
  customerName.value = item.name;
  showCustomer.value = false;
}

async function load() {
  const listData = await api.listCustomers();
  customers.value = listData.list;
  if (isEdit.value) {
    const rows = await api.listAssets();
    const row = rows.list.find((r) => r.id === Number(route.params.id));
    if (!row) {
      showToast('记录不存在');
      router.back();
      return;
    }
    Object.assign(form, { ...row, amount: String(row.amount ?? '') });
    customerName.value = row.customer_name;
  } else if (route.query.customerId) {
    const c = customers.value.find((x) => x.id === Number(route.query.customerId));
    if (c) chooseCustomer(c);
  }
}

async function save() {
  if (!form.customer_id) {
    showToast('请选择所属客户');
    return;
  }
  saving.value = true;
  try {
    const payload = { ...form, amount: Number(form.amount) || 0, customer_id: form.customer_id };
    if (isEdit.value) {
      await api.updateAsset(route.params.id, payload);
    } else {
      await api.createAssets([payload]);
    }
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

<style scoped>
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
