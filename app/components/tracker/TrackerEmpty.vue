<template>
  <p class="text-sm py-8 text-center" :style="{ color: 'var(--text-muted)' }">{{ message }}</p>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ message?: string }>(), { message: 'No data in this range yet.' })
</script>
