<template>
  <f7-page id="wallet_accounts__board-settings" name="wallet_accounts__board-settings" class="wallet_accounts__page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('wallet_accounts.board-settings.title', 'Settings')}}</f7-nav-title>
    </f7-navbar>
    <f7-list class="list-custom">
      <f7-list-item
        v-if="!hasActorId"
        link="/wallet_accounts/list-management/"
        :title="$t('wallet_accounts.board-settings.list-management',  'List Management')"
      ></f7-list-item>
      <f7-list-item
        v-else
        link="/wallet_accounts/wallet-balance/"
        :title="$t('wallet_accounts.board-settings.wallet-balance',  'Wallet Balance')"
      ></f7-list-item>
      <tag-select
        v-if="!hasActorId"
        v-for="(permission, index) in permissions"
        :key="index"
        :data="permission"
        @tagAdd="(tag) => addListPermission(permission, tag)"
        @tagRemove="(tag) => removeListPermission(permission, tag)"
      ></tag-select>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';
  import tagSelect from '../components/tag-select.vue';

  export default {
    components: {
      tagSelect,
    },
    data() {
      return {
        hasActorId: API.actorId,
        permissions: [],
      };
    },
    mounted() {
      const self = this;
      self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_create_access', {
        resource_id: undefined,
        with_filters: true,
      }).then((permission) => {
        permission.resource_id = undefined;
        self.permissions.push(permission);
      });
      self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_edit_access', {
        resource_id: undefined,
        with_filters: true,
      }).then((permission) => {
        permission.resource_id = undefined;
        self.permissions.push(permission);
      });
    },
    methods: {
      saveListPermission(permission) {
        const self = this;
        self.$api.updateInstalledAddonPermission('wallet_accounts', permission.name, {
          resource_id: permission.resource_id,
          with_filters: true,
          filters: JSON.stringify(permission.filters),
        });
      },
      addListPermission(permission, tag) {
        const self = this;
        permission.filters.push(tag);
        self.saveListPermission(permission);
      },
      removeListPermission(permission, tag) {
        const self = this;
        permission.filters.splice(permission.filters.indexOf(tag), 1);
        self.saveListPermission(permission);
      },
    },
  };
</script>

