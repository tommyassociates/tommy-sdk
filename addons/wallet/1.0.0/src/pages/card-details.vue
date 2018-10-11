<template>
  <f7-page name="wallet__card_details" id="wallet__card_details">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{card ? card.name : $f7route.query.name}}</f7-nav-title>
    </f7-navbar>

    <wallet-transaction-list v-if="transactions" :transactions="transactions"></wallet-transaction-list>

  </f7-page>
</template>
<script>
  import API from '../api';
  import walletTransactionList from '../components/wallet-transaction-list.vue';

  export default {
    components: {
      walletTransactionList,
    },
    props: {
      id: [String, Number],
    },
    data() {
      return {
        transactions: null,
      };
    },
    mounted() {
      const self = this;
      API.getWalletTransactions(self.id).then((transactions) => {
        self.transactions = transactions;
      });
    },
  };
</script>
