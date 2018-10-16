<template>
  <f7-page name="nurse_booking__order-canceled" id="nurse_booking__order-canceled" no-navbar>
    <div class="order-status-title">{{$t('nurse_booking.order_canceled.title')}}</div>
    <div class="order-status-img">
      <img :src="`${$addonAssetsUrl}order-canceled.svg`">
    </div>
    <div class="order-status-message">{{$t('nurse_booking.order_canceled.message')}}</div>
    <div class="order-status-buttons">
      <a href="/nurse_booking/" data-clear-previous-history="true">{{$t('nurse_booking.order_canceled.home_button')}}</a>
    </div>
  </f7-page>
</template>
<script>
  export default {};
</script>

