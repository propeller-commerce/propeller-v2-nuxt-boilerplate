<template>
  <div
    v-if="problem"
    class="mb-4 rounded-lg border p-3 text-sm"
    :style="{ borderColor: color, color }"
    role="status"
  >
    <strong class="font-medium">
      {{ ordinary ? 'No analytics database' : 'Analytics database problem' }}
    </strong>
    <span class="ml-2">{{ problem.hint }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

/**
 * "Why is this dashboard empty?" (PWP-910).
 *
 * The three ways a fresh install has no data — no database configured, a
 * database that is unreachable, a schema that was never created — are
 * indistinguishable from a quiet day once the panels have rendered their zeros.
 * This asks the API once and says which one it is, with the fix.
 *
 * Its own request rather than lifting state out of the nine sections: the cause
 * is global, the `health` probe scans nothing, and threading a status up from
 * whichever section happens to be mounted would put dashboard plumbing in all
 * of them.
 */

const problem = ref<{ status: string; hint: string } | null>(null)
const controller = new AbortController()

onMounted(async () => {
  try {
    const res = await fetch('/api/tracker?metric=health', {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (res.ok) return
    const json = await res.json()
    if (json?.status) problem.value = { status: json.status, hint: json.hint ?? '' }
  } catch {
    // A network failure here says nothing useful — the panels report it.
  }
})

onUnmounted(() => controller.abort())

// Not configured is an ordinary state for a shop that never set analytics up,
// so it is informational. The rest are mistakes, and look like it.
const ordinary = computed(() => problem.value?.status === 'not_configured')
const color = computed(() => (ordinary.value ? 'var(--text-secondary)' : 'var(--status-warning)'))
</script>
