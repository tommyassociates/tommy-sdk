<template>
  <f7-page name="wallet_accounts__transaction_details" id="wallet_accounts__transaction_details">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('wallet_accounts.transaction_details.title', 'Transaction Details')}}</f7-nav-title>
    </f7-navbar>

    <template v-if="transaction">
      <div class="wallet_accounts-transaction-header">
        <div class="wallet_accounts-transaction-header-wrap">
          <div class="wallet_accounts-transaction-icon">
            <img v-if="transaction.icon_url" :src="transaction.icon_url">
            <i v-else class="wallet_accounts-transaction-icon-placeholder"></i>
          </div>
          <div class="wallet_accounts-transaction-payment-info">
            <div class="wallet_accounts-transaction-payment-name">{{transaction.payee_name}}</div>
            <div class="wallet_accounts-transaction-payment-amount">{{formatTransactionAmount(transaction)}}</div>
          </div>
        </div>
        <div class="wallet_accounts-transaction-status">{{formatTransactionStatus(transaction.status)}}</div>
      </div>

      <f7-list class="wallet_accounts-transaction-details-list" no-hairlines>
        <f7-list-item
          v-if="transaction.card_name"
          :title="$t('wallet_accounts.transaction_details.payment_label', 'Payment')"
          :after="transaction.card_name"
        ></f7-list-item>
        <f7-list-item
          :title="$t('wallet_accounts.transaction_details.time_label', 'Time')"
          :after="formatTransactionDate(transaction.paid_at)"
        ></f7-list-item>
        <f7-list-item
          :title="$t('wallet_accounts.transaction_details.payee_label', 'Payee')"
          :after="transaction.payee_name"
        ></f7-list-item>
      </f7-list>
    </template>

  </f7-page>
</template>
<script>
  import API from '../api';
  import formatTransactionAmount from '../utils/format-transaction-amount';
  import formatTransactionStatus from '../utils/format-transaction-status';
  import formatTransactionDate from '../utils/format-transaction-date';

  export default {
    props: {
      id: [String, Number],
    },
    data() {
      return {
        transaction: null,
      };
    },
    mounted() {
      const self = this;
      API.loadTransaction(self.id).then((transaction) => {
        self.transaction = transaction;
      });
    },
    methods: {
      formatTransactionAmount,
      formatTransactionStatus,
      formatTransactionDate,
    },
  };
</script>
