<template>
  <div class="container-width py-12">
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
    <div v-else-if="page">
      <div v-for="block in page.blocks" :key="block.id">
        <pre class="text-xs text-foreground-subtle">{{ block.__component }}</pre>
      </div>
    </div>
    <CmsFallback v-else />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import CmsFallback from '~/components/layout/CmsFallback.vue';

const route = useRoute();
const page = ref<any>(null);
const loading = ref(true);

async function loadPage() {
  loading.value = true;
  try {
    // CMS page loaded from Strapi/Sanity/etc - implement when CMS is configured
  } catch (e) {
    console.error('Failed to load CMS page', e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadPage);
watch(() => route.params.slug, loadPage);

useHead({ title: 'Page' });
</script>
