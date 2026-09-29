import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { title: '登录' } },
  { path: '/', name: 'customers', component: () => import('../views/CustomerList.vue'), meta: { tab: 'customers', title: '客户' } },
  { path: '/table', name: 'table', component: () => import('../views/AssetTable.vue'), meta: { tab: 'table', title: '资产表格' } },
  { path: '/ocr', name: 'ocr', component: () => import('../views/OcrCapture.vue'), meta: { title: '拍照识别' } },
  { path: '/chat', name: 'chat', component: () => import('../views/Chat.vue'), meta: { title: 'AI 对话' } },
  { path: '/analysis', name: 'analysis', component: () => import('../views/Analysis.vue'), meta: { tab: 'analysis', title: 'AI 分析' } },
  { path: '/settings', name: 'settings', component: () => import('../views/Settings.vue'), meta: { title: '设置' } },
  { path: '/customer/new', name: 'customer-new', component: () => import('../views/CustomerForm.vue'), meta: { title: '新建客户' } },
  { path: '/customer/:id/edit', name: 'customer-edit', component: () => import('../views/CustomerForm.vue'), meta: { title: '编辑客户' } },
  { path: '/customer/:id', name: 'customer-detail', component: () => import('../views/CustomerDetail.vue'), meta: { title: '客户详情' } },
  { path: '/asset/new', name: 'asset-new', component: () => import('../views/AssetForm.vue'), meta: { title: '新增资产' } },
  { path: '/asset/:id/edit', name: 'asset-edit', component: () => import('../views/AssetForm.vue'), meta: { title: '编辑资产' } },
  { path: '/products', name: 'products', component: () => import('../views/ProductList.vue'), meta: { title: '产品库' } },
  { path: '/product/new', name: 'product-new', component: () => import('../views/ProductForm.vue'), meta: { title: '新增产品' } },
  { path: '/product/:id/edit', name: 'product-edit', component: () => import('../views/ProductForm.vue'), meta: { title: '编辑产品' } },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
