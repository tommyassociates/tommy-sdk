<template>
  <f7-page name="wallet_accounts__wallet-balance" id="wallet_accounts__wallet-balance" class="wallet_accounts__page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('wallet_accounts.wallet-balance.title', 'Wallet Balance')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="list-custom" v-if="balance !== null && hasActorCard">
      <f7-list-item divider :title="$t('wallet_accounts.wallet-balance.balance', 'Balance')"></f7-list-item>
      <f7-list-input type="number" min="0" :value="balance" @input="balance = parseFloat($event.target.value)" :placeholder="$t('wallet_accounts.wallet-balance.balance', 'Balance')"></f7-list-input>

      <f7-list-item divider :title="$t('wallet_accounts.wallet-balance.credit_limit', 'Credit Limit')"></f7-list-item>
      <f7-list-input type="number" min="0" :value="credit_limit" @input="credit_limit = parseFloat($event.target.value)" :placeholder="$t('wallet_accounts.wallet-balance.credit_limit', 'Credit Limit')"></f7-list-input>
    </f7-list>

    <f7-block strong class="text-align-center" v-if="hasActorCard === false">
      {{$t('wallet_accounts.wallet-balance.no_wallet_card')}}
    </f7-block>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        saving: false,
        balance: null,
        credit_limit: null,
        hasActorCard: null,
        cardId: null,
      };
    },
    computed: {
      showSave() {
        return this.balance !== null && this.balance >= 0 && this.credit_limit !== null && this.credit_limit >= 0;
      },
    },
    mounted() {
      const self = this;
      API.getActorCard().then((card) => {
        if (!card) {
          self.hasActorCard = false;
          return;
        }
        self.hasActorCard = true;
        self.balance = card.balance;
        self.credit_limit = card.credit_limit;
        self.cardId = card.id;
      });
    },
    methods: {
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        const { balance, credit_limit, cardId } = self;
        API
          .saveBalance(
            cardId,
            balance,
            credit_limit
          )
          .then(() => {
            self.$f7router.back(`/wallet_accounts/${API.actorId ? `?actor_id=${API.actorId}` : ''}`, { force: true });
          });
      },
    },
  };
</script>