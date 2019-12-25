<template>
  <f7-page class="time-clock-settings-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_clock.settings.title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-only class="back">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
  </f7-page>
</template>

<script>
  import API from '../api';
  //import tagSelect from '../components/tag-select.vue';

  export default {
    name: "TimeClockSettings",
    components: {
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
    data() {
      return {
        hasActorId: API.actorId,
        permissions: [],
      };
    }
  };
</script>