<template>
  <section class="rounded-lg border p-4" :style="{ borderColor: 'var(--border-1)', background: 'var(--surface-2)' }">
    <header class="mb-3">
      <h2 class="text-sm font-semibold" :style="{ color: 'var(--text-primary)' }">{{ title }}</h2>
      <p v-if="subtitle" class="text-xs mt-0.5" :style="{ color: 'var(--text-secondary)' }">{{ subtitle }}</p>
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>
