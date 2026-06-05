<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-3xl font-bold tracking-tight">Addresses</h1>
    </div>

    <ClientOnly>
      <div class="space-y-4 pb-10">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="space-y-2">
            <h2 class="font-semibold text-md">Default Billing Address</h2>
            <AddressCard
              v-if="defaultAddresses.invoice"
              :key="`inv-${defaultAddresses.invoice.id}`"
              :labels="addressCardLabels"
              :address="defaultAddresses.invoice"
              :enableDelete="false"
              :onEdit="handleEditAddress"
              :onDelete="handleDeleteAddress"
              :onSetDefault="handleSetDefault"
              :countries="COUNTRIES"
            />
            <div v-else class="border border-dashed rounded-[var(--radius-container)] p-6 flex flex-col items-center justify-center text-center space-y-2">
              <p class="text-sm text-muted-foreground">No default invoice address</p>
              <button type="button" class="text-primary text-sm hover:underline" @click="handleAddAddress(AddressType.invoice)">Add One</button>
            </div>
          </div>

          <div class="space-y-2">
            <h2 class="font-semibold text-md">Default Delivery Address</h2>
            <AddressCard
              v-if="defaultAddresses.delivery"
              :key="`del-${defaultAddresses.delivery.id}`"
              :labels="addressCardLabels"
              :address="defaultAddresses.delivery"
              :enableDelete="false"
              :onEdit="handleEditAddress"
              :onDelete="handleDeleteAddress"
              :onSetDefault="handleSetDefault"
              :countries="COUNTRIES"
            />
            <div v-else class="border border-dashed rounded-[var(--radius-container)] p-6 flex flex-col items-center justify-center text-center space-y-2">
              <p class="text-sm text-muted-foreground">No default delivery address</p>
              <button type="button" class="text-primary text-sm hover:underline" @click="handleAddAddress(AddressType.delivery)">Add One</button>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Additional Billing Addresses</h2>
          <button type="button" class="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors" @click="handleAddAddress(AddressType.invoice)">
            + Add New
          </button>
        </div>
        <div v-if="billingAddresses.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AddressCard
            v-for="address in billingAddresses"
            :key="address.id"
            :labels="addressCardLabels"
            :address="address"
            :onEdit="handleEditAddress"
            :onDelete="handleDeleteAddress"
            :onSetDefault="handleSetDefault"
            :countries="COUNTRIES"
          />
        </div>
        <p v-else class="text-muted-foreground italic text-sm">No additional billing addresses.</p>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Additional Delivery Addresses</h2>
          <button type="button" class="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors" @click="handleAddAddress(AddressType.delivery)">
            + Add New
          </button>
        </div>
        <div v-if="deliveryAddresses.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AddressCard
            v-for="address in deliveryAddresses"
            :key="address.id"
            :labels="addressCardLabels"
            :address="address"
            :onEdit="handleEditAddress"
            :onDelete="handleDeleteAddress"
            :onSetDefault="handleSetDefault"
            :countries="COUNTRIES"
          />
        </div>
        <p v-else class="text-muted-foreground italic text-sm">No additional delivery addresses.</p>
      </div>

      <AddressCard
        v-if="showAddModal"
        :labels="addressCardLabels"
        :address="null"
        :addressType="addModalType"
        :isNew="true"
        :enableActions="false"
        :onEdit="handleSaveNewAddress"
        :onCancel="() => { showAddModal = false }"
        :countries="COUNTRIES"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { type Address, AddressType, type Company, YesNo } from '@propeller-commerce/propeller-sdk-v2';
import type { Contact, Customer } from '@propeller-commerce/propeller-sdk-v2';
import { AddressCard, useAddress, type AddressInput, type AnyUser } from 'propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCompanyStore } from '~/stores/company';
import { COUNTRIES } from '~/utils/countries';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const authStore = useAuthStore();
const companyStore = useCompanyStore();
const addressCardLabels = useTranslations('AddressCard');
const { $graphqlClient } = useNuxtApp();

const showAddModal = ref(false);
const addModalType = ref<AddressType>(AddressType.invoice);

const userRef = computed(() => authStore.user as AnyUser);
const companyIdRef = computed(() => companyStore.selectedCompany?.companyId);

const { createAddress, updateAddress, deleteAddress, setDefaultAddress } = useAddress({
  graphqlClient: $graphqlClient as any,
  user: userRef,
  companyId: companyIdRef,
});

function isContact(u: Contact | Customer | null): u is Contact {
  return u !== null && 'contactId' in u;
}
function isCustomer(u: Contact | Customer | null): u is Customer {
  return u !== null && 'customerId' in u;
}
function getActiveCompany(): Company | null {
  const u = userRef.value;
  if (!u || !isContact(u as Contact)) return null;
  const targetId = companyStore.selectedCompany?.companyId;
  if (targetId) {
    const companiesRaw = (u as any).companies;
    const items = (companiesRaw?.items ?? companiesRaw) as Company[] | undefined;
    if (Array.isArray(items)) {
      const found = items.find((c) => c.companyId === targetId);
      if (found) return found;
    }
    if ((u as Contact).company?.companyId === targetId) return (u as Contact).company as Company;
  }
  return ((u as Contact).company as Company | undefined) ?? null;
}
function getAllAddresses(): Address[] {
  const u = userRef.value;
  if (!u) return [];
  if (isContact(u as Contact)) return getActiveCompany()?.addresses || [];
  if (isCustomer(u as Customer)) return (u as Customer).addresses || [];
  return [];
}

const defaultAddresses = computed(() => {
  const addresses = getAllAddresses();
  return {
    invoice: addresses.find((a) => a.type === AddressType.invoice && a.isDefault === YesNo.Y),
    delivery: addresses.find((a) => a.type === AddressType.delivery && a.isDefault === YesNo.Y),
  };
});
const billingAddresses = computed(() =>
  getAllAddresses().filter((a) => a.type === AddressType.invoice && a.isDefault === YesNo.N)
);
const deliveryAddresses = computed(() =>
  getAllAddresses().filter((a) => a.type === AddressType.delivery && a.isDefault === YesNo.N)
);

function handleAddAddress(type: AddressType) {
  addModalType.value = type;
  showAddModal.value = true;
}

async function handleEditAddress(address: Address) {
  const result = await updateAddress(Number(address.id), address as Partial<AddressInput>);
  if (result.success) await authStore.refreshUser();
}
async function handleDeleteAddress(address: Address) {
  const result = await deleteAddress(Number(address.id));
  if (result.success) await authStore.refreshUser();
}
async function handleSetDefault(address: Address) {
  if (!address.id) return;
  const result = await setDefaultAddress(Number(address.id));
  if (result.success) await authStore.refreshUser();
}
async function handleSaveNewAddress(address: any) {
  const result = await createAddress({
    company: address.company || undefined,
    gender: address.gender || undefined,
    firstName: address.firstName || undefined,
    middleName: address.middleName || undefined,
    lastName: address.lastName || undefined,
    email: address.email || undefined,
    street: address.street || '',
    number: address.number || undefined,
    numberExtension: address.numberExtension || undefined,
    postalCode: address.postalCode || '',
    city: address.city || '',
    country: address.country || 'NL',
    notes: address.notes || undefined,
    isDefault: (address.isDefault as YesNo) || YesNo.N,
    type: addModalType.value,
  });
  if (result.success) {
    await authStore.refreshUser();
    showAddModal.value = false;
  }
}

useHead({ title: 'Addresses' });
</script>
