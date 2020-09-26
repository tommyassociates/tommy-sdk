<template>
  <f7-page name="subscriptions__payments" id="subscriptions__payments">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>Payment History</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>
    <f7-list v-if="!loading && payments.length">
      <f7-list-item
        v-for="(payment, index) in payments" :key="index"
        :header="formatDate(payment.created_at, 'D/M/YY hh:mm')"
        :title="formatMoney(payment.amount_cents / 100.0)"
      >
        <f7-link slot="after-title" @click.prevent="downloadInvoice(payment.id)" href="#" icon-f7="tray_arrow_down" icon-size="20"></f7-link>
      </f7-list-item>
    </f7-list>
    <div v-else class="block no-data">No payments to display</div>
  </f7-page>
</template>
<script>
  import API from "../api";
  // import config from 'tommy-core/src/config'
  import formatDate from 'tommy-core/src/utils/format-date';
  import {formatMoney} from 'tommy-core/src/utils/format-number';

  export default {
    data() {
      return {
        payments: [],
        loading: true
      }
    },
    mounted() {
      this.loadPayments()
    },
    methods: {
      formatDate,
      formatMoney,
      // paymentMessage(payment) {
      //   return formatMoney(payment.total_cents / 100.0);
      //
      //   // let msg = payment.amount_cents
      //   // if (payment.error) {
      //   //   msg += ': ' + payment.error
      //   // }
      //   // return msg
      // },
      loadPayments() {
        API.getPayments().then(payments => {
          this.payments = payments
          this.loading = false
          console.log('loaded payments', this.payments)
        })
      },

      downloadInvoice(paymentId) {
        API.downloadInvoice(paymentId)
          alert(paymentId)
      }
    },
  }
</script>
