import { ref, watch, type Ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'

/**
 * Fetches one named metric from /api/tracker and re-polls it (PWP-910).
 *
 * "Real time" here is a 30-second poll, paused while the tab is hidden —
 * deliberately not SSE or a websocket, which would hold a connection open for a
 * dashboard nobody watches continuously.
 *
 * `useIntervalFn` rather than a bare `setInterval`: it stops on scope dispose,
 * so leaving /tracker actually stops the polling instead of hammering the
 * database from a route the user has left.
 */

export const POLL_MS = 30_000

export interface MetricState<T> {
  data: Ref<T | null>
  error: Ref<string | null>
  /**
   * Set when the API reports a setup problem (503) rather than a query fault.
   * The dashboard shows one banner for this instead of an error per panel — the
   * cause is global, so nine copies of it is noise.
   */
  setup: Ref<{ status: string; hint: string } | null>
  loading: Ref<boolean>
  reload: () => void
}

export function useMetric<T = unknown>(
  metric: string,
  from: Ref<string>,
  to: Ref<string>,
  limit = 20,
): MetricState<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const setup = ref<{ status: string; hint: string } | null>(null)
  const loading = ref(true)

  let controller: AbortController | null = null

  async function load() {
    // One request in flight per metric: a range change while a slow query is
    // running would otherwise race, and the loser could land last.
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    try {
      const url = `/api/tracker?metric=${encodeURIComponent(metric)}&from=${from.value}&to=${to.value}&limit=${limit}`
      const res = await fetch(url, { signal, cache: 'no-store' })
      const json = await res.json()
      if (signal.aborted) return
      if (!res.ok) {
        data.value = null
        error.value = json?.error ?? `HTTP ${res.status}`
        setup.value = json?.status ? { status: json.status, hint: json.hint ?? '' } : null
        loading.value = false
        return
      }
      data.value = json.data as T
      error.value = null
      setup.value = null
      loading.value = false
    } catch (e) {
      if (signal.aborted || (e as Error)?.name === 'AbortError') return
      data.value = null
      error.value = (e as Error)?.message ?? 'failed'
      setup.value = null
      loading.value = false
    }
  }

  // Polling stops while hidden so a backgrounded tab does not keep hitting the
  // database all afternoon.
  useIntervalFn(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') void load()
  }, POLL_MS)

  watch([from, to], () => void load(), { immediate: true })

  return { data, error, setup, loading, reload: load }
}
