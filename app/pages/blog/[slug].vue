<template>
  <div class="container-width py-12 max-w-3xl">
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
    <article v-else-if="post">
      <button type="button" @click="router.back()" class="text-primary hover:underline text-sm mb-6 block">
        ← Back to Blog
      </button>
      <img v-if="post.cover?.url" :src="post.cover.url" :alt="post.title" class="w-full h-64 object-cover rounded-[var(--radius-container)] mb-8" />
      <h1 class="text-4xl font-bold mb-4">{{ post.title }}</h1>
      <p class="text-sm text-muted-foreground mb-8">{{ post.publishedAt }}</p>
      <div class="prose max-w-none" v-html="renderedContent" />
    </article>
    <CmsFallback v-else />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { marked } from 'marked';
import CmsFallback from '~/components/layout/CmsFallback.vue';

const router = useRouter();
const post = ref<any>(null);
const loading = ref(true);

const renderedContent = computed(() => (post.value?.content ? (marked(post.value.content) as string) : ''));

onMounted(async () => {
  // CMS integration goes here when wired
  loading.value = false;
});

useHead(() => ({ title: post.value?.title || 'Blog post' }));
</script>
