<template>
  <f7-page name="wallet__settings" id="wallet__settings">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('wallet.settings.title', 'Settings')}}</f7-nav-title>
    </f7-navbar>

    <f7-list class="wallet-settings-list">
      <f7-list-item
        :title="`${$t('wallet.settings.balance_label', 'Show Balance')}`"
      >
        <f7-toggle slot="after" :checked="showBalance" @change="toggleShowBalance"></f7-toggle>
      </f7-list-item>
      <f7-list-item
        :title="`${$t('wallet.settings.inform_label', 'Inform')}`"
      >
        <f7-toggle slot="after" :checked="enableNotifications" @change="toggleNotifications"></f7-toggle>
      </f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        showBalance: API.wallet.show_balance,
        enableNotifications: API.wallet.enable_notifications,
      };
    },
    methods: {
      toggleShowBalance(e) {
        API.updateWalletSettings({
          show_balance: e.target.checked,
        });
      },
      toggleNotifications(e) {
        API.updateWalletSettings({
          enable_notifications: e.target.checked,
        });
      },
    },
  };
</script>
