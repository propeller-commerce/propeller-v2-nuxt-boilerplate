<template>
  <footer class="bg-[#242526] text-slate-100 mt-auto border-t border-slate-800">
    <div class="container-width py-12 md:py-16">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div class="space-y-4">
          <h3 class="text-xl font-bold tracking-tight text-white">{{ siteName }}</h3>
          <p class="text-sm text-slate-400 leading-relaxed max-w-xs">{{ description }}</p>
        </div>

        <div>
          <h4 class="text-sm font-semibold uppercase tracking-wider text-slate-200 mb-4">Shop</h4>
          <ul class="space-y-3 text-sm text-slate-400">
            <li>
              <NuxtLink :to="localizeHref('/', languageStore.language)" class="hover:text-white transition-colors">All products</NuxtLink>
            </li>
            <li>
              <NuxtLink :to="localizeHref('/new-arrivals', languageStore.language)" class="hover:text-white transition-colors">New arrivals</NuxtLink>
            </li>
            <li>
              <NuxtLink :to="localizeHref('/sale', languageStore.language)" class="hover:text-white transition-colors">Sale</NuxtLink>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="text-sm font-semibold uppercase tracking-wider text-slate-200 mb-4">Support</h4>
          <ul class="space-y-3 text-sm text-slate-400">
            <li>
              <NuxtLink :to="localizeHref('/account', languageStore.language)" class="hover:text-white transition-colors">My account</NuxtLink>
            </li>
            <li>
              <NuxtLink :to="localizeHref('/terms-conditions', languageStore.language)" class="hover:text-white transition-colors">Terms &amp; conditions</NuxtLink>
            </li>
            <li>
              <NuxtLink :to="localizeHref('/blog', languageStore.language)" class="hover:text-white transition-colors">Blog</NuxtLink>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="text-sm font-semibold uppercase tracking-wider text-slate-200 mb-4">Contact</h4>
          <ul class="space-y-3 text-sm text-slate-400">
            <li class="flex items-start gap-2">
              <svg class="w-5 h-5 mt-0.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>{{ email }}</span>
            </li>
            <li class="flex items-start gap-2">
              <svg class="w-5 h-5 mt-0.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>{{ phone }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <p class="text-xs text-slate-500">{{ copyright }}</p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';

const languageStore = useLanguageStore();
const runtimeConfig = useRuntimeConfig();

const siteName = (runtimeConfig.public.siteName as string | undefined) || 'Propeller Shop';
const description =
  (runtimeConfig.public.footerDescription as string | undefined) ||
  'Your trusted destination for premium electronics. Quality products, fast shipping, and exceptional support.';
const email = (runtimeConfig.public.footerEmail as string | undefined) || 'info@propeller.com';
const phone = (runtimeConfig.public.footerPhone as string | undefined) || '+1 234 567 890';
const copyright = computed(() => `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`);
</script>
