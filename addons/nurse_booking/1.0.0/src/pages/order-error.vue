<template>
  <f7-page name="nurse_booking__order-error" id="nurse_booking__order-error" no-navbar>
    <div class="order-status-title">{{$t('nurse_booking.order_error.title')}}</div>
    <div class="order-status-img">
      <img :src="`${$addonAssetsUrl}order-success.svg`">
    </div>
    <div class="order-status-buttons">
      <a href="/nurse_booking/order-details/?masterDetailRoot=true">{{$t('nurse_booking.order_error.details_button')}}</a>
      <a href="/nurse_booking/" class="no-master-detail" data-clear-previous-history="true">{{$t('nurse_booking.order_error.home_button')}}</a>
    </div>
  </f7-page>
</template>
<script>
  export default {};
</script>

