<script setup lang="ts">
// Machines root (/machines) — contact-only via the auth middleware. The
// `[...slug].vue` sibling handles drill-down; both render <MachineBrowser>,
// which reads `route.params.slug` (undefined here → the root grid).
definePageMeta({ middleware: 'auth' });
</script>

<template>
  <MachineBrowser />
</template>
