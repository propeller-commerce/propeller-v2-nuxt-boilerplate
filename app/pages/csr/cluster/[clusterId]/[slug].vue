<script setup lang="ts">
import { ClusterInfo } from '@propeller-commerce/propeller-v2-vue-ui';

definePageMeta({ ssr: false });

const route = useRoute();
const clusterId = computed(() => Number.parseInt(route.params.clusterId as string, 10));

useHead(() => ({ title: `CSR cluster #${clusterId.value}` }));
</script>

<template>
  <ClientOnly>
    <div class="container-width py-8">
      <h1 class="text-3xl font-bold mb-6">Cluster (CSR) — #{{ clusterId }}</h1>
      <ClusterInfo :cluster-id="clusterId" />
    </div>
  </ClientOnly>
</template>
