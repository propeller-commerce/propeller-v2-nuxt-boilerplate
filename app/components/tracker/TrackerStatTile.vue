<template>
  <div class="rounded-lg border p-4" :style="{ borderColor: 'var(--border-1)', background: 'var(--surface-2)' }">
    <div class="text-xs uppercase tracking-wide" :style="{ color: 'var(--text-muted)' }">{{ label }}</div>
    <div class="mt-1 text-2xl font-semibold tabular-nums" :style="{ color }">{{ display }}</div>
    <div v-if="hint" class="mt-1 text-xs" :style="{ color: 'var(--text-secondary)' }">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { nf } from './format'

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    tone?: 'default' | 'warning' | 'good'
  }>(),
  { tone: 'default' },
)

const display = computed(() =>
  typeof props.value === 'number' ? nf.format(props.value) : props.value,
)

// Status colours are reserved for state, never reused as a series colour.
const color = computed(() =>
  props.tone === 'warning'
    ? 'var(--status-warning)'
    : props.tone === 'good'
      ? 'var(--status-good)'
      : 'var(--text-primary)',
)
</script>
