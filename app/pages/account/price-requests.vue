<template>
  <div class="space-y-6">
    <h1 class="text-3xl font-bold tracking-tight">Price Requests</h1>
    <div class="border rounded-[var(--radius-container)] p-8 flex flex-col items-center justify-center text-center space-y-3">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
      <h3 class="text-lg font-semibold">Coming Soon</h3>
      <p class="text-sm text-muted-foreground">This feature is not yet available.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'account', middleware: 'auth' });
useHead({ title: 'Price requests' });
</script>
