<template>
  <f7-page @page:afterin="onPageAfterIn" name="nurse_booking__order-success" id="nurse_booking__order-success" no-navbar>
    <div class="order-status-title">{{$t('nurse_booking.order_success.title')}}</div>
    <div class="order-status-img">
      <img :src="`${$addonAssetsUrl}order-success.svg`">
    </div>
    <div class="order-status-buttons">
      <a :href="`/nurse_booking/order-details/?backToHome=true&id=${$f7route.query.id}&masterDetailRoot=true`">{{$t('nurse_booking.order_success.details_button')}}</a>
      <a href="/nurse_booking/" class="no-master-detail" data-clear-previous-history="true">{{$t('nurse_booking.order_success.home_button')}}</a>
    </div>
  </f7-page>
</template>
<script>
  export default {
    mounted() {
      const self = this;
      document.addEventListener('backbutton', self.onBackButton);
    },
    beforeDestroy() {
      const self = this;
      document.removeEventListener('backbutton', self.onBackButton);
    },
    methods: {
      onBackButton() {
        const self = this;
        self.$f7router.back('/nurse_booking/', { force: true });
      },
      onPageAfterIn() {
        const self = this;
        setTimeout(() => {
          self.$f7router.clearPreviousHistory();
        }, 500);
      },
    },
  };
</script>

