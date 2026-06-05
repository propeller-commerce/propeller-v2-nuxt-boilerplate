<script setup lang="ts">
// /search/foo/bar style — re-route into /search?q=foo+bar so we have one
// canonical implementation. propeller-vue keeps both; here the path-style
// alias just normalises to the query-style URL.
const route = useRoute();
const router = useRouter();

const term = computed(() => {
  const raw = route.params.term;
  return Array.isArray(raw) ? raw.join(' ') : (raw as string);
});

if (import.meta.server) {
  await navigateTo(
    { path: '/search', query: { q: term.value, ...route.query } },
    { redirectCode: 301, replace: true }
  );
} else {
  router.replace({ path: '/search', query: { q: term.value, ...route.query } });
}
</script>

<template>
  <div />
</template>
