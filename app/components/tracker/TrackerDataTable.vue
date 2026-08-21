<template>
  <TrackerEmpty v-if="!rows.length" />
  <!-- Wide tables scroll inside their own box; the page body never scrolls sideways. -->
  <div v-else class="viz-scroll">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr>
          <th
            v-for="c in columns"
            :key="c.key"
            class="py-2 px-2 font-medium text-xs whitespace-nowrap"
            :class="c.align === 'right' ? 'text-right' : 'text-left'"
            :style="{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-1)' }"
          >
            {{ c.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <td
            v-for="c in columns"
            :key="c.key"
            class="py-2 px-2 whitespace-nowrap"
            :class="c.align === 'right' ? 'text-right tabular-nums' : 'text-left'"
            :style="{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-1)' }"
          >
            {{ cell(row, c) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import TrackerEmpty from './TrackerEmpty.vue'
import type { Row } from './format'

/**
 * The table view every chart on this page ships beside.
 *
 * Not decoration: it is what makes the numbers readable without relying on
 * colour, which is the documented relief for the light-mode contrast warning on
 * three of the series hues.
 */

export interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
  format?: (v: unknown, row: Row) => string
}

defineProps<{ rows: Row[]; columns: Column[] }>()

function cell(row: Row, c: Column): string {
  return c.format ? c.format(row[c.key], row) : String(row[c.key] ?? '—')
}
</script>
