<template>
  <router-view />
  <AppTabbar v-if="showTabbar" />
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppTabbar from './components/AppTabbar.vue';

const route = useRoute();
const showTabbar = computed(() => Boolean(route.meta?.tab));
</script>
