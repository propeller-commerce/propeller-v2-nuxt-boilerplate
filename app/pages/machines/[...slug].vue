<script setup lang="ts">
// Machines drill-down (/machines/a/b/…) — contact-only via the auth middleware.
// Nuxt's single-bracket catch-all requires ≥1 segment, so the root lives in the
// sibling `index.vue`. Both render <MachineBrowser>.
definePageMeta({ middleware: 'auth' });
</script>

<template>
  <MachineBrowser />
</template>
