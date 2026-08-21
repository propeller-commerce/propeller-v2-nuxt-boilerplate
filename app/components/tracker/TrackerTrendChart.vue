<template>
  <TrackerEmpty v-if="!data.length" />
  <div v-else>
    <!-- Legend is always present for two or more series, so identity is never
         carried by colour alone. -->
    <ul v-if="series.length > 1" class="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs">
      <li v-for="(s, i) in series" :key="s.key" class="flex items-center gap-1.5">
        <span
          class="inline-block h-0.5 w-4 rounded"
          :style="{ background: SERIES[i % SERIES.length] }"
          aria-hidden="true"
        />
        <span :style="{ color: 'var(--text-secondary)' }">{{ s.label }}</span>
      </li>
    </ul>

    <div class="relative" @mouseleave="hover = null">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full"
        :style="{ height: height + 'px' }"
        role="img"
        :aria-label="ariaLabel"
        @mousemove="onMove"
      >
        <!-- Grid recedes: horizontal rules only, no vertical clutter. -->
        <g>
          <line
            v-for="tick in yTicks"
            :key="tick.value"
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="tick.y"
            :y2="tick.y"
            stroke="var(--grid)"
            stroke-width="1"
          />
          <text
            v-for="tick in yTicks"
            :key="`l-${tick.value}`"
            :x="PAD.left - 6"
            :y="tick.y + 3"
            text-anchor="end"
            font-size="10"
            fill="var(--text-secondary)"
          >
            {{ nf.format(tick.value) }}
          </text>
        </g>

        <!-- X labels: thinned so they never collide on a 90-day range. -->
        <text
          v-for="tick in xTicks"
          :key="tick.label"
          :x="tick.x"
          :y="H - 6"
          text-anchor="middle"
          font-size="10"
          fill="var(--text-secondary)"
        >
          {{ tick.label }}
        </text>

        <!-- 2px marks, no per-point dots — a dot on every day is noise at 90. -->
        <polyline
          v-for="(line, i) in lines"
          :key="line.key"
          :points="line.points"
          fill="none"
          :stroke="SERIES[i % SERIES.length]"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <g v-if="hover !== null">
          <line
            :x1="xAt(hover)"
            :x2="xAt(hover)"
            :y1="PAD.top"
            :y2="H - PAD.bottom"
            stroke="var(--border-1)"
            stroke-width="1"
          />
          <!-- A 2px surface ring so an active point stays legible where lines overlap. -->
          <circle
            v-for="(line, i) in lines"
            :key="`d-${line.key}`"
            :cx="xAt(hover)"
            :cy="yAt(line.values[hover])"
            r="3.5"
            :fill="SERIES[i % SERIES.length]"
            stroke="var(--surface-2)"
            stroke-width="2"
          />
        </g>
      </svg>

      <div
        v-if="hover !== null"
        class="pointer-events-none absolute top-2 rounded border px-2 py-1.5 text-xs"
        :style="{
          left: tooltipLeft,
          borderColor: 'var(--border-1)',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
        }"
      >
        <div class="font-medium mb-0.5">{{ String(data[hover][xKey] ?? '').slice(0, 10) }}</div>
        <div v-for="(line, i) in lines" :key="`t-${line.key}`" class="flex items-center gap-1.5">
          <span
            class="inline-block h-0.5 w-3 rounded"
            :style="{ background: SERIES[i % SERIES.length] }"
            aria-hidden="true"
          />
          <span :style="{ color: 'var(--text-secondary)' }">{{ line.label }}</span>
          <span class="tabular-nums ml-auto">{{ nf.format(line.values[hover]) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TrackerEmpty from './TrackerEmpty.vue'
import { nf, num, SERIES, type Row } from './format'

/**
 * One-axis time series, hand-rolled SVG.
 *
 * No charting dependency: recharts has no Vue port, and every alternative would
 * land permanently in BOTH Vue repos for one chart type. A polyline over ≤90
 * points, a few gridlines and a crosshair is about a hundred lines and is
 * SSR-safe, themed from the same CSS vars as everything else.
 *
 * ponytail: fixed viewBox scaled by CSS rather than a resize observer. It is
 * correct at every width — only the label DENSITY is fixed rather than
 * responsive. Add a ResizeObserver if the x-labels ever crowd on narrow phones.
 *
 * ONE y-axis, always. Two measures of different scale get two charts — a second
 * axis is the single most misread thing a chart can do.
 */

const props = withDefaults(
  defineProps<{
    data: Row[]
    xKey: string
    series: { key: string; label: string }[]
    height?: number
  }>(),
  { height: 260 },
)

const W = 720
const H = 260
const PAD = { top: 8, right: 8, bottom: 20, left: 44 }

const hover = ref<number | null>(null)

const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

/** Nice round ceiling, so the axis reads 0/25/50 rather than 0/23/46. */
const max = computed(() => {
  const values = props.series.flatMap((s) => props.data.map((r) => num(r[s.key])))
  const peak = Math.max(...values, 1)
  const magnitude = 10 ** Math.floor(Math.log10(peak))
  return Math.ceil(peak / magnitude) * magnitude
})

function xAt(i: number): number {
  if (props.data.length < 2) return PAD.left + plotW / 2
  return PAD.left + (i / (props.data.length - 1)) * plotW
}

function yAt(value: number): number {
  return PAD.top + plotH - (value / max.value) * plotH
}

const lines = computed(() =>
  props.series.map((s) => {
    const values = props.data.map((r) => num(r[s.key]))
    return {
      key: s.key,
      label: s.label,
      values,
      points: values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' '),
    }
  }),
)

const yTicks = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const value = Math.round(max.value * f)
    return { value, y: yAt(value) }
  }),
)

const xTicks = computed(() => {
  const count = props.data.length
  // At most ~7 labels regardless of range, so a 90-day view does not overlap.
  const step = Math.max(1, Math.ceil(count / 7))
  const out: { x: number; label: string }[] = []
  for (let i = 0; i < count; i += step) {
    out.push({ x: xAt(i), label: String(props.data[i][props.xKey] ?? '').slice(5, 10) })
  }
  return out
})

const ariaLabel = computed(
  () => `${props.series.map((s) => s.label).join(', ')} over ${props.data.length} days`,
)

const tooltipLeft = computed(() => {
  if (hover.value === null) return '0%'
  const pct = (xAt(hover.value) / W) * 100
  // Flipped past the midpoint so it never runs off the right edge.
  return pct > 60 ? `calc(${pct}% - 160px)` : `calc(${pct}% + 12px)`
})

function onMove(event: MouseEvent) {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  if (!rect.width) return
  // Hit target is the whole column, not the 2px line — a crosshair the user has
  // to land on pixel-perfectly is a crosshair nobody uses.
  const ratio = ((event.clientX - rect.left) / rect.width) * W
  const fraction = (ratio - PAD.left) / plotW
  const index = Math.round(fraction * Math.max(1, props.data.length - 1))
  hover.value = Math.min(props.data.length - 1, Math.max(0, index))
}
</script>
