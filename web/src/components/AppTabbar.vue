<template>
  <van-tabbar route fixed placeholder safe-area-inset-bottom>
    <van-tabbar-item to="/" icon="friends-o">客户</van-tabbar-item>
    <van-tabbar-item to="/table" icon="records">表格</van-tabbar-item>
    <van-tabbar-item to="/chat" icon="chat-o">对话</van-tabbar-item>
    <van-tabbar-item to="/analysis" icon="chart-trending-o">分析</van-tabbar-item>
  </van-tabbar>
</template>

<script setup>
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant';
</script>
