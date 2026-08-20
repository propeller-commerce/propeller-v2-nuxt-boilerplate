<template>
  <TrackerEmpty v-if="!data.length" />
  <ol v-else class="space-y-2">
    <li v-for="(row, i) in bars" :key="i">
      <div class="flex items-baseline justify-between gap-3 text-xs mb-1">
        <span class="truncate" :style="{ color: 'var(--text-secondary)' }" :title="row.label">
          {{ row.label }}
        </span>
        <span class="tabular-nums shrink-0" :style="{ color: 'var(--text-primary)' }">
          {{ nf.format(row.value) }}
        </span>
      </div>
      <div class="h-2 rounded" :style="{ background: 'var(--grid)' }">
        <div
          class="h-2 rounded"
          :style="{ width: row.pct + '%', background: color, minWidth: row.value > 0 ? '4px' : '0' }"
        />
      </div>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TrackerEmpty from './TrackerEmpty.vue'
import { nf, num, SERIES, type Row } from './format'

/**
 * Ranked horizontal bars (PWP-910).
 *
 * A bar list, never a pie: ranked categorical reads better and long product
 * names actually fit. Plain HTML/CSS rather than SVG — the bars are rectangles
 * with text beside them, which is what a `<div>` already is.
 *
 * One hue for the whole list on purpose. These are ranked values of ONE measure,
 * not distinct series, so per-bar colour would encode rank — and rank is
 * already encoded by position and length.
 */

const props = withDefaults(
  defineProps<{
    data: Row[]
    labelKey: string
    valueKey: string
    colorIndex?: number
  }>(),
  { colorIndex: 0 },
)

const color = computed(() => SERIES[props.colorIndex % SERIES.length])

const bars = computed(() => {
  const values = props.data.map((r) => num(r[props.valueKey]))
  // Scaled against the largest bar, not the sum: this is a ranking, not a
  // part-to-whole — the rows are a top-N slice, so they do not sum to anything.
  const top = Math.max(...values, 1)
  return props.data.map((r, i) => ({
    label: String(r[props.labelKey] ?? '—') || '—',
    value: values[i],
    pct: (values[i] / top) * 100,
  }))
})
</script>
