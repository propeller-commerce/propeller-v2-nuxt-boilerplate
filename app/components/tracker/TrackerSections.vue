<template>
  <div class="space-y-4">
    <!-- ── Overview ─────────────────────────────────────────────────────── -->
    <template v-if="section === 'overview'">
      <!-- A setup problem is already reported once, globally, by the banner. -->
      <div
        v-if="overview.error.value && !overview.setup.value"
        class="rounded-lg border p-3 text-sm"
        :style="{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }"
        role="alert"
      >
        Query failed: {{ overview.error.value }}
      </div>

      <div class="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <TrackerStatTile label="Visits" :value="o.visits" hint="Distinct sessions" />
        <TrackerStatTile label="Visitors" :value="o.visitors" hint="Distinct visitor ids" />
        <TrackerStatTile label="Page views" :value="o.pageViews" />
        <TrackerStatTile label="Add to cart" :value="o.addToCarts" />
        <TrackerStatTile label="Orders" :value="o.orders" />
        <TrackerStatTile label="Revenue" :value="cf.format(o.revenue)" />
      </div>

      <div class="grid gap-3 grid-cols-2 md:grid-cols-4">
        <TrackerStatTile label="Searches" :value="o.searches" :hint="o.zeroHint" />
        <TrackerStatTile
          label="Zero-result searches"
          :value="o.zero"
          :tone="o.zero > 0 ? 'warning' : 'default'"
          hint="Unsatisfied purchase intent"
        />
        <TrackerStatTile label="Logins" :value="o.logins" />
        <TrackerStatTile label="Accounts active" :value="o.companies" hint="Distinct companies" />
      </div>

      <TrackerPanel title="Activity over time" subtitle="Daily totals across the selected range">
        <TrackerTrendChart
          :data="asRows(trend.data.value)"
          xKey="day"
          :series="[
            { key: 'visits', label: 'Visits' },
            { key: 'page_views', label: 'Page views' },
            { key: 'add_to_carts', label: 'Add to cart' },
            { key: 'orders', label: 'Orders' },
          ]"
        />
      </TrackerPanel>
    </template>

    <!-- ── Visitors ─────────────────────────────────────────────────────── -->
    <template v-else-if="section === 'visitors'">
      <TrackerPanel
        title="Anonymous vs known"
        subtitle="B2B contacts, B2C customers and logged-out visitors. Summing daily visitors across days gives visits, not unique people."
      >
        <div class="grid gap-4 lg:grid-cols-2">
          <TrackerBarList :data="asRows(split.data.value)" labelKey="user_mode" valueKey="visitors" />
          <TrackerDataTable
            :rows="asRows(split.data.value)"
            :columns="[
              { key: 'user_mode', label: 'Mode' },
              { key: 'visitors', label: 'Visitors', align: 'right', format: fmt },
              { key: 'visits', label: 'Visits', align: 'right', format: fmt },
              { key: 'events', label: 'Events', align: 'right', format: fmt },
            ]"
          />
        </div>
      </TrackerPanel>

      <TrackerPanel title="Visits and visitors over time">
        <TrackerTrendChart
          :data="asRows(trend.data.value)"
          xKey="day"
          :series="[
            { key: 'visits', label: 'Visits' },
            { key: 'visitors', label: 'Visitors' },
          ]"
        />
      </TrackerPanel>
    </template>

    <!-- ── Registrations & logins ───────────────────────────────────────── -->
    <template v-else-if="section === 'identity'">
      <TrackerPanel title="Registrations and logins over time">
        <TrackerTrendChart
          :data="asRows(identityTrend.data.value)"
          xKey="day"
          :series="[
            { key: 'logins', label: 'Logins' },
            { key: 'registrations', label: 'Registrations submitted' },
            { key: 'sign_ups', label: 'Sign-ups' },
            { key: 'sessions', label: 'Sessions started' },
          ]"
        />
      </TrackerPanel>
      <TrackerPanel title="Daily detail">
        <TrackerDataTable
          :rows="asRows(identityTrend.data.value)"
          :columns="[
            { key: 'day', label: 'Day', format: (v: unknown) => String(v).slice(0, 10) },
            { key: 'sessions', label: 'Sessions', align: 'right', format: fmt },
            { key: 'logins', label: 'Logins', align: 'right', format: fmt },
            { key: 'logouts', label: 'Logouts', align: 'right', format: fmt },
            { key: 'registrations', label: 'Registrations', align: 'right', format: fmt },
            { key: 'sign_ups', label: 'Sign-ups', align: 'right', format: fmt },
          ]"
        />
      </TrackerPanel>
    </template>

    <!-- ── Pages ────────────────────────────────────────────────────────── -->
    <template v-else-if="section === 'pages'">
      <TrackerPanel
        title="Most visited"
        subtitle="Any page type — categories, products, account screens, CMS pages"
      >
        <div class="grid gap-4 lg:grid-cols-2">
          <TrackerBarList :data="topPageRows" labelKey="label" valueKey="views" />
          <TrackerDataTable
            :rows="topPageRows"
            :columns="[
              { key: 'label', label: 'Page' },
              { key: 'page_type', label: 'Type' },
              { key: 'views', label: 'Views', align: 'right', format: fmt },
              { key: 'visitors', label: 'Visitors', align: 'right', format: fmt },
            ]"
          />
        </div>
      </TrackerPanel>

      <TrackerPanel title="Where visits go" subtitle="Distribution by page type">
        <div class="grid gap-4 lg:grid-cols-2">
          <TrackerBarList
            :data="asRows(pageTypes.data.value)"
            labelKey="page_type"
            valueKey="views"
            :colorIndex="2"
          />
          <TrackerDataTable
            :rows="asRows(pageTypes.data.value)"
            :columns="[
              { key: 'page_type', label: 'Page type' },
              { key: 'views', label: 'Views', align: 'right', format: fmt },
              { key: 'visitors', label: 'Visitors', align: 'right', format: fmt },
            ]"
          />
        </div>
      </TrackerPanel>
    </template>

    <!-- ── Search ───────────────────────────────────────────────────────── -->
    <template v-else-if="section === 'search'">
      <TrackerPanel
        title="Searches that found nothing"
        subtitle="The headline signal: a named account repeatedly finding nothing is an assortment gap with a customer attached."
      >
        <div class="grid gap-4 lg:grid-cols-2">
          <TrackerBarList
            :data="asRows(zeroSearches.data.value)"
            labelKey="search_term"
            valueKey="searches"
            :colorIndex="1"
          />
          <TrackerDataTable
            :rows="asRows(zeroSearches.data.value)"
            :columns="[
              { key: 'search_term', label: 'Query' },
              { key: 'searches', label: 'Times', align: 'right', format: fmt },
              { key: 'visitors', label: 'Visitors', align: 'right', format: fmt },
              { key: 'companies', label: 'Accounts', align: 'right', format: fmt },
            ]"
          />
        </div>
      </TrackerPanel>

      <TrackerPanel
        title="Top searches"
        subtitle="All searches, whether or not they returned results"
      >
        <div class="grid gap-4 lg:grid-cols-2">
          <TrackerBarList
            :data="asRows(topSearches.data.value)"
            labelKey="search_term"
            valueKey="searches"
          />
          <TrackerDataTable
            :rows="asRows(topSearches.data.value)"
            :columns="[
              { key: 'search_term', label: 'Query' },
              { key: 'searches', label: 'Times', align: 'right', format: fmt },
              { key: 'visitors', label: 'Visitors', align: 'right', format: fmt },
              { key: 'max_results', label: 'Results', align: 'right', format: fmt },
            ]"
          />
        </div>
      </TrackerPanel>
    </template>

    <!-- ── Catalog ──────────────────────────────────────────────────────── -->
    <template v-else-if="section === 'catalog'">
      <TrackerPanel
        title="Add to cart by source"
        subtitle="Which surface actually converts — the same product added from search means something different from the same add on its PDP."
      >
        <div class="grid gap-4 lg:grid-cols-2">
          <TrackerBarList
            :data="asRows(bySource.data.value)"
            labelKey="source_type"
            valueKey="adds"
            :colorIndex="2"
          />
          <TrackerDataTable
            :rows="asRows(bySource.data.value)"
            :columns="[
              { key: 'source_type', label: 'Source' },
              { key: 'adds', label: 'Adds', align: 'right', format: fmt },
              { key: 'visitors', label: 'Visitors', align: 'right', format: fmt },
              { key: 'value', label: 'Value', align: 'right', format: money },
            ]"
          />
        </div>
      </TrackerPanel>
    </template>

    <!-- ── Cart & checkout ──────────────────────────────────────────────── -->
    <template v-else-if="section === 'checkout'">
      <TrackerPanel
        title="Checkout funnel"
        subtitle="Distinct sessions reaching each step, with drop-off from the step above"
      >
        <TrackerFunnelBars :steps="funnelSteps" />
      </TrackerPanel>
      <TrackerPanel title="Funnel detail">
        <TrackerDataTable
          :rows="funnelSteps.map((s) => ({ step: s.label, sessions: s.value }))"
          :columns="[
            { key: 'step', label: 'Step' },
            { key: 'sessions', label: 'Sessions', align: 'right', format: fmt },
          ]"
        />
      </TrackerPanel>
    </template>

    <!-- ── Accounts (B2B) ───────────────────────────────────────────────── -->
    <template v-else-if="section === 'accounts'">
      <TrackerPanel
        title="Account activity"
        subtitle="What each company did. Failed searches and add-to-carts without orders are the rows worth a phone call."
      >
        <TrackerEmpty
          v-if="!asRows(accounts.data.value).length"
          message="No logged-in company activity in this range."
        />
        <TrackerDataTable
          v-else
          :rows="asRows(accounts.data.value)"
          :columns="[
            { key: 'company_id', label: 'Company' },
            { key: 'contacts', label: 'Contacts', align: 'right', format: fmt },
            { key: 'visits', label: 'Visits', align: 'right', format: fmt },
            { key: 'page_views', label: 'Pages', align: 'right', format: fmt },
            { key: 'failed_searches', label: 'Failed searches', align: 'right', format: fmt },
            { key: 'add_to_carts', label: 'Adds', align: 'right', format: fmt },
            { key: 'orders', label: 'Orders', align: 'right', format: fmt },
            { key: 'last_seen', label: 'Last seen', align: 'right', format: when },
          ]"
        />
      </TrackerPanel>
    </template>

    <!-- ── Event explorer ───────────────────────────────────────────────── -->
    <template v-else-if="section === 'events'">
      <TrackerPanel title="Events by name" subtitle="Every event type recorded in the range">
        <div class="grid gap-4 lg:grid-cols-2">
          <TrackerBarList
            :data="asRows(eventCounts.data.value)"
            labelKey="event_name"
            valueKey="events"
            :colorIndex="4"
          />
          <TrackerDataTable
            :rows="asRows(eventCounts.data.value)"
            :columns="[
              { key: 'event_name', label: 'Event' },
              { key: 'events', label: 'Count', align: 'right', format: fmt },
              { key: 'visitors', label: 'Visitors', align: 'right', format: fmt },
            ]"
          />
        </div>
      </TrackerPanel>

      <TrackerPanel
        title="Recent events"
        subtitle="Raw rows — the escape hatch for anything the fixed panels do not answer"
      >
        <TrackerDataTable
          :rows="asRows(recentEvents.data.value)"
          :columns="[
            { key: 'occurred_at', label: 'When', format: when },
            { key: 'event_name', label: 'Event' },
            { key: 'user_mode', label: 'Mode' },
            { key: 'company_id', label: 'Company', align: 'right' },
            { key: 'page_type', label: 'Page' },
            { key: 'entity_id', label: 'Entity', align: 'right' },
            { key: 'source_type', label: 'Source' },
            { key: 'search_term', label: 'Query' },
            { key: 'sku', label: 'SKU' },
            { key: 'value', label: 'Value', align: 'right', format: plain },
          ]"
        />
      </TrackerPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import TrackerBarList from './TrackerBarList.vue'
import TrackerDataTable from './TrackerDataTable.vue'
import TrackerEmpty from './TrackerEmpty.vue'
import TrackerFunnelBars from './TrackerFunnelBars.vue'
import TrackerPanel from './TrackerPanel.vue'
import TrackerStatTile from './TrackerStatTile.vue'
import TrackerTrendChart from './TrackerTrendChart.vue'
import { asRows, cf, fmt, nf, num, type Row } from './format'
import { useMetric } from '~/composables/useMetric'

/**
 * The nine /tracker sections (PWP-910).
 *
 * One component rather than nine files: each section is markup over a metric,
 * and the only thing they share is which one is showing. Every metric is
 * declared unconditionally — `useMetric` is a fetch + poll, and the polls are
 * cheap enough that switching sections instantly is worth more than skipping
 * the ones off screen.
 *
 * Sections are grouped by subject rather than by event name, because a rep
 * thinks in questions ("what did this account do?"), not in taxonomies.
 */

const props = defineProps<{ section: string; from: string; to: string }>()

// `toRef`, not destructuring: the template unwraps refs when binding, so the
// props arrive as plain strings and `useMetric` needs something that stays
// reactive when the date range changes.
const from = toRef(props, 'from')
const to = toRef(props, 'to')

const overview = useMetric<Row>('overview', from, to)
const trend = useMetric<Row[]>('trend', from, to)
const split = useMetric<Row[]>('visitor_split', from, to)
const identityTrend = useMetric<Row[]>('identity_trend', from, to)
const topPages = useMetric<Row[]>('top_pages', from, to, 20)
const pageTypes = useMetric<Row[]>('page_types', from, to)
const zeroSearches = useMetric<Row[]>('zero_result_searches', from, to, 25)
const topSearches = useMetric<Row[]>('top_searches', from, to, 25)
const bySource = useMetric<Row[]>('add_to_cart_by_source', from, to)
const funnel = useMetric<Row[]>('funnel', from, to)
const accounts = useMetric<Row[]>('accounts', from, to, 50)
const eventCounts = useMetric<Row[]>('event_counts', from, to)
const recentEvents = useMetric<Row[]>('recent_events', from, to, 100)

const money = (v: unknown) => cf.format(num(v))
const plain = (v: unknown) => (v == null ? '—' : nf.format(num(v)))
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '—')

const o = computed(() => {
  const raw = (overview.data.value ?? {}) as Row
  const searches = num(raw.searches)
  const zero = num(raw.zero_result_searches)
  return {
    visits: num(raw.visits),
    visitors: num(raw.visitors),
    pageViews: num(raw.page_views),
    addToCarts: num(raw.add_to_carts),
    orders: num(raw.orders),
    revenue: num(raw.revenue),
    logins: num(raw.logins),
    companies: num(raw.companies),
    searches,
    zero,
    zeroHint: searches > 0 ? `${Math.round((zero / searches) * 100)}% found nothing` : undefined,
  }
})

const topPageRows = computed(() =>
  asRows(topPages.data.value).map((r) => ({
    ...r,
    label: String(r.entity_name ?? '') || `${r.page_type}${r.entity_id ? ` #${r.entity_id}` : ''}`,
  })),
)

const FUNNEL_ORDER = [
  { key: 'view_item', label: 'Product viewed' },
  { key: 'add_to_cart', label: 'Added to cart' },
  { key: 'view_cart', label: 'Cart viewed' },
  { key: 'begin_checkout', label: 'Checkout started' },
  { key: 'add_shipping_info', label: 'Shipping chosen' },
  { key: 'add_payment_info', label: 'Payment chosen' },
  { key: 'purchase', label: 'Purchased' },
]

const funnelSteps = computed(() => {
  const map = new Map(asRows(funnel.data.value).map((r) => [String(r.event_name), num(r.sessions)]))
  return FUNNEL_ORDER.map((s) => ({ label: s.label, value: map.get(s.key) ?? 0 }))
})
</script>
