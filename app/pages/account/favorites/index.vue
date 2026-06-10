<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold tracking-tight">Favorites</h1>
    </div>
    <ClientOnly>
      <FavoriteLists
        v-if="authStore.user"
        :labels="favoriteListsLabels"
        :showActions="true"
        :allowFavoriteListCreate="true"
        :onListClick="(id: string) => router.push(localizeHref(`/account/favorites/${id}`, languageStore.language))"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { FavoriteLists } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const router = useRouter();
const authStore = useAuthStore();
const languageStore = useLanguageStore();
const favoriteListsLabels = useTranslations('FavoriteLists');

useHead({ title: 'Favorites' });
</script>
