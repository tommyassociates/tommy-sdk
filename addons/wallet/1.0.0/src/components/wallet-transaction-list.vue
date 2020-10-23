<template>
  <f7-list media-list no-hairlines no-chevron class="wallet__list transaction-list">
    <f7-list-item
      v-for="(transaction, index) in transactions"
      :key="index"
      :link="`/wallet/transaction/${transaction.id}/`"
    >
      <img v-if="transaction.icon_url" slot="media" :src="transaction.icon_url">
      <i v-else slot="media" class="wallet__icon-placeholder"></i>
      <div class="item-details" slot="inner-start">
        <div class="item-title-row">
          <div class="item-title">{{transaction.payee_name}}</div>
        </div>
        <div class="item-text">{{formatTransactionDate(transaction.paid_at)}}</div>
      </div>
      <div class="item-after" slot="inner-end">{{formatTransactionAmount(transaction)}}</div>
    </f7-list-item>
  </f7-list>
</template>
<script>
  import formatTransactionAmount from '../utils/format-transaction-amount';
  import formatTransactionDate from '../utils/format-transaction-date';

  export default {
    props: {
      transactions: Array,
    },
    methods: {
      formatTransactionDate,
      formatTransactionAmount,
    },
  };
</script>

