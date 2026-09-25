<template>
  <div class="container-width py-12">
    <div v-if="page">
      <div v-for="block in page.blocks" :key="block.id">
        <pre class="text-xs text-foreground-subtle">{{ block.__component }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * CMS catch-all. Matches every URL no other route claims, so when there is no
 * CMS page behind the slug the path genuinely does not exist and we answer
 * 404 — rendering a 200 fallback here would soft-404 every dead link, typo
 * and removed URL.
 *
 * Resolved in `useAsyncData` (not `onMounted`) so the status is set while the
 * server still owns the response; a client-only check cannot change it.
 */
const route = useRoute();

const { data: page } = await useAsyncData(
  () => `cms-page:${Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug}`,
  async () => {
    try {
      // CMS page loaded from Strapi/Sanity/etc - implement when CMS is configured
      return null;
    } catch (e) {
      console.error('Failed to load CMS page', e);
      return null;
    }
  },
  { watch: [() => route.params.slug] },
);

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true });
}

useHead({ title: () => (page.value as { title?: string } | null)?.title ?? '' });
</script>
