<template>
  <TrackerEmpty v-if="!steps.length" />
  <ol v-else class="space-y-2">
    <li v-for="row in bars" :key="row.label">
      <div class="flex items-baseline justify-between text-xs mb-1">
        <span :style="{ color: 'var(--text-secondary)' }">{{ row.label }}</span>
        <span class="tabular-nums" :style="{ color: 'var(--text-primary)' }">
          {{ nf.format(row.value) }}
          <span v-if="row.drop" :style="{ color: 'var(--text-muted)' }"> · −{{ row.drop }}%</span>
        </span>
      </div>
      <div class="h-2 rounded" :style="{ background: 'var(--grid)' }">
        <div
          class="h-2 rounded"
          :style="{ width: row.pct + '%', background: SERIES[0], minWidth: row.value > 0 ? '4px' : '0' }"
        />
      </div>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TrackerEmpty from './TrackerEmpty.vue'
import { nf, SERIES } from './format'

/**
 * Checkout funnel as ORDERED BARS, not a tapering triangle.
 *
 * A funnel shape encodes each step's value as an area, which reads as a bigger
 * difference than the numbers support. Bars on a shared baseline are the same
 * data read correctly, and leave room for the drop-off percentage that is the
 * actual thing being looked for.
 */

const props = defineProps<{ steps: { label: string; value: number }[] }>()

const bars = computed(() => {
  const top = Math.max(...props.steps.map((s) => s.value), 1)
  return props.steps.map((s, i) => {
    const prev = i > 0 ? props.steps[i - 1].value : null
    return {
      label: s.label,
      value: s.value,
      pct: (s.value / top) * 100,
      drop: prev && prev > 0 ? Math.max(0, Math.round(((prev - s.value) / prev) * 100)) : 0,
    }
  })
})
</script>
