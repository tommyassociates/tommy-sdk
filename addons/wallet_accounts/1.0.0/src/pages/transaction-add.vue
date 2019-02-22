<template>
  <f7-page id="wallet_accounts__transaction-add" name="wallet_accounts__transaction-add" class="with-toggle-save wallet_accounts__page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('wallet_accounts.transaction-add.title', 'New Transaction')}}</f7-nav-title>
      <f7-nav-right v-if="showSave">
        <f7-link icon-f7="check" @click="save"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="list-custom">
      <f7-list-input type="number" min="0" :value="amount" @input="amount = parseFloat($event.target.value)" :placeholder="$t('wallet_accounts.transaction-add.amount_placeholder', 'Amount')"></f7-list-input>
      <f7-list-input type="text" :value="payee_name" @input="payee_name = $event.target.value" :placeholder="$t('wallet_accounts.transaction-add.payee_placeholder', 'Payee')"></f7-list-input>
      <f7-list-item
        smart-select
        :smart-select-params="{
          searchbar: true,
          pageBackLinkText: $t('label.back'),
          searchbarPlaceholder: $t('label.search'),
          searchbarDisableText: $t('label.cancel'),
        }"
        v-if="cards && cards.length"
        :title="$t('wallet_accounts.transaction-add.wallet_account_placeholder')"
      >
        <select :value="wallet_card_id" @change="wallet_card_id = parseInt($event.target.value, 10)">
          <option
            v-for="(card) in cards"
            :key="card.id"
            :value="card.id"
            data-option-class="wallet_accounts_smart-select-option"
            :data-option-image="card.holder.icon_url"
          >{{card.holder.first_name || ''}} {{card.holder.last_name || ''}}</option>
        </select>
      </f7-list-item>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        saving: false,
        amount: '',
        payee_name: '',
        wallet_card_id: null,
        cards: null,
      };
    },
    computed: {
      showSave() {
        const { saving, amount, payee_name } = this;
        return !saving && (amount && amount > 0 && payee_name && payee_name.trim().length);
      },
    },
    mounted() {
      const self = this;
      API.getCards().then((cards) => {
        self.wallet_card_id = cards[0].id;
        self.cards = cards;
      });
    },
    methods: {
      save() {
        const self = this;
        self.saving = true;
        const { amount, payee_name, wallet_card_id } = this;
        if (!amount) {
          self.$f7.dialog.alert(self.$t('wallet_accounts.transaction-add.no_amount_error'));
          return;
        }
        if (!payee_name) {
          self.$f7.dialog.alert(self.$t('wallet_accounts.transaction-add.no_payee_error'));
          return;
        }
        API
          .saveTransaction({
            amount,
            wallet_card_id,
            payee_name,
            status: 'paid',
            addon: 'wallet_accounts',
            addon_id: undefined,
            addon_install_id: undefined,
          })
          .then(() => {
            self.$events.$emit('wallet_accounts:reloadLists');
            self.$f7router.back();
          });
      },
    },
  };
</script>

