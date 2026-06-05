<template>
  <div class="container-width py-12">
    <h1 class="text-3xl font-bold mb-8">Blog</h1>
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
    <CmsFallback v-else-if="!posts.length" />
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="post in posts"
        :key="post.slug"
        class="bg-card rounded-[var(--radius-container)] shadow overflow-hidden hover:shadow-md transition cursor-pointer"
        @click="router.push(localizeHref(`/blog/${post.slug}`, languageStore.language))"
      >
        <img v-if="post.cover?.url" :src="post.cover.url" :alt="post.title" class="w-full h-48 object-cover" />
        <div class="p-5">
          <p class="text-xs text-muted-foreground mb-2">{{ post.publishedAt }}</p>
          <h2 class="text-lg font-semibold mb-2 line-clamp-2">{{ post.title }}</h2>
          <p class="text-sm text-muted-foreground line-clamp-3">{{ post.excerpt }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import CmsFallback from '~/components/layout/CmsFallback.vue';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';

const router = useRouter();
const languageStore = useLanguageStore();
const posts = ref<any[]>([]);
const loading = ref(true);

onMounted(async () => {
  // CMS integration goes here when wired
  loading.value = false;
});

useHead({ title: 'Blog' });
</script>
