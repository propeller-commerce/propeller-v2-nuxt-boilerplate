<template>
  <!-- Client-only: this page self-fetches /api/tracker, which on the server
       would mean a self-request with the wrong base URL and no cookies, plus a
       database round trip per render of a page nobody crawls — and this app has
       real page-cache infrastructure (server/utils/cache.ts) to protect. -->
  <ClientOnly>
    <div class="viz-root min-h-screen">
    <div class="flex flex-col lg:flex-row">
      <aside
        class="lg:w-60 lg:min-h-screen border-b lg:border-b-0 lg:border-r p-4 shrink-0"
        :style="{ borderColor: 'var(--border-1)', background: 'var(--surface-2)' }"
      >
        <div class="mb-4">
          <h1 class="text-base font-semibold" :style="{ color: 'var(--text-primary)' }">
            Storefront tracker
          </h1>
          <p class="text-xs mt-0.5" :style="{ color: 'var(--text-muted)' }">
            Live · refreshes every {{ POLL_MS / 1000 }}s
          </p>
        </div>

        <nav aria-label="Tracker sections">
          <div v-for="group in GROUPS" :key="group" class="mb-3">
            <div
              class="text-[10px] uppercase tracking-wider mb-1 px-2"
              :style="{ color: 'var(--text-muted)' }"
            >
              {{ group }}
            </div>
            <ul class="space-y-0.5">
              <li v-for="s in SECTIONS.filter((x) => x.group === group)" :key="s.id">
                <button
                  type="button"
                  :aria-current="s.id === section ? 'page' : undefined"
                  class="block w-full text-left rounded px-2 py-1.5 text-sm"
                  :style="{
                    background: s.id === section ? 'var(--surface-1)' : 'transparent',
                    color: s.id === section ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: s.id === section ? 600 : 400,
                  }"
                  @click="select(s.id)"
                >
                  {{ s.label }}
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <main class="flex-1 p-4 lg:p-6 min-w-0">
        <!-- Filters live in one row above the charts. -->
        <div class="flex flex-wrap items-end gap-3 mb-5">
          <div class="flex gap-1">
            <button
              v-for="p in PRESETS"
              :key="p.label"
              type="button"
              class="rounded px-2.5 py-1.5 text-xs border"
              :style="{
                borderColor: 'var(--border-1)',
                background: isPreset(p) ? 'var(--surface-2)' : 'transparent',
                color: isPreset(p) ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isPreset(p) ? 600 : 400,
              }"
              @click="applyPreset(p)"
            >
              {{ p.label }}
            </button>
          </div>

          <label class="text-xs" :style="{ color: 'var(--text-secondary)' }">
            From
            <input
              v-model="from"
              type="date"
              :max="to"
              class="ml-1 rounded border px-2 py-1 text-xs"
              :style="{
                borderColor: 'var(--border-1)',
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
              }"
            />
          </label>
          <label class="text-xs" :style="{ color: 'var(--text-secondary)' }">
            To
            <input
              v-model="to"
              type="date"
              :min="from"
              :max="today"
              class="ml-1 rounded border px-2 py-1 text-xs"
              :style="{
                borderColor: 'var(--border-1)',
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
              }"
            />
          </label>
        </div>

        <!-- Above the panels: it explains the zeros they are about to show. -->
        <TrackerSetupBanner />

        <TrackerSections :section="section" :from="from" :to="to" />
      </main>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TrackerSections from '~/components/tracker/TrackerSections.vue'
import TrackerSetupBanner from '~/components/tracker/TrackerSetupBanner.vue'
import { POLL_MS } from '~/composables/useMetric'

/**
 * /tracker — sidebar, date range, section switch.
 *
 * ponytail: ungated by request — GATE BEFORE DEPLOY. This page exposes every
 * account's behaviour and revenue to anyone with the URL, which is fine on a
 * local box and is not fine anywhere shared.
 *
 * The range picker is a pair of native `<input type="date">` — no picker
 * library for something the platform already ships.
 */

const SECTIONS = [
  { id: 'overview', label: 'Overview', group: 'Summary' },
  { id: 'visitors', label: 'Visitors & sessions', group: 'Audience' },
  { id: 'identity', label: 'Registrations & logins', group: 'Audience' },
  { id: 'pages', label: 'Pages', group: 'Behaviour' },
  { id: 'search', label: 'Search', group: 'Behaviour' },
  { id: 'catalog', label: 'Catalog', group: 'Behaviour' },
  { id: 'checkout', label: 'Cart & checkout', group: 'Commerce' },
  { id: 'accounts', label: 'Accounts (B2B)', group: 'Commerce' },
  { id: 'events', label: 'Event explorer', group: 'Raw' },
] as const

const GROUPS = Array.from(new Set(SECTIONS.map((s) => s.group)))

/** Local calendar date — the dashboard's ranges are shop-local, not UTC. */
function localISO(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
  { label: '90 days', days: 89 },
]

const route = useRoute()
const router = useRouter()

const today = localISO()
const from = ref(localISO(6))
const to = ref(today)
const section = ref<string>(String(route.query.section ?? 'overview'))

function select(id: string) {
  section.value = id
  // In the query rather than the path: one route, and the section survives a
  // reload or a pasted link without nine more router entries.
  void router.replace({ query: { ...route.query, section: id } })
}

const isPreset = (p: { days: number }) => from.value === localISO(p.days) && to.value === today

function applyPreset(p: { days: number }) {
  from.value = localISO(p.days)
  to.value = today
}

useHead({
  title: 'Storefront tracker',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<!-- Unscoped on purpose: the custom properties have to cascade into every
     tracker child component, and scoping would confine them to this file. -->
<style>
/*
 * /tracker palette.
 *
 * Values come from the dataviz reference palette and were run through its
 * validator in both modes before use — not eyeballed. Light mode: all checks
 * pass with a contrast WARN on aqua/yellow/magenta, whose documented relief is
 * visible labels or a table view; every chart on this page ships beside its
 * table, which satisfies it.
 *
 * Dark values are declared under BOTH the media query and the [data-theme]
 * scope so an explicit theme choice wins in either direction.
 */
.viz-root {
  color-scheme: light;

  --surface-1: #fcfcfb;
  --surface-2: #f4f3f0;
  --border-1: #e2e1dc;

  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #78766f;

  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --series-5: #e87ba4;

  --status-good: #0ca30c;
  --status-warning: #fab219;
  --status-critical: #d03b3b;

  --grid: #e8e7e2;

  background: var(--surface-1);
  color: var(--text-primary);
}

@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme='light'])) .viz-root {
    color-scheme: dark;

    --surface-1: #1a1a19;
    --surface-2: #232322;
    --border-1: #383835;

    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #96958c;

    --series-1: #3987e5;
    --series-2: #d95926;
    --series-3: #199e70;
    --series-4: #c98500;
    --series-5: #d55181;

    --grid: #2f2f2d;
  }
}

:root[data-theme='dark'] .viz-root {
  color-scheme: dark;

  --surface-1: #1a1a19;
  --surface-2: #232322;
  --border-1: #383835;

  --text-primary: #ffffff;
  --text-secondary: #c3c2b7;
  --text-muted: #96958c;

  --series-1: #3987e5;
  --series-2: #d95926;
  --series-3: #199e70;
  --series-4: #c98500;
  --series-5: #d55181;

  --grid: #2f2f2d;
}

/* Wide content scrolls inside its own box; the page body never scrolls sideways. */
.viz-scroll {
  overflow-x: auto;
}
</style>
