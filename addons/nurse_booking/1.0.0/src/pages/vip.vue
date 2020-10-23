<template>
  <f7-page name="nurse_booking__vip" id="nurse_booking__vip" @page:beforein="onPageBeforeIn" @page:beforeout="onPageBeforeOut">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
    </f7-navbar>

    <div class="vip-header">
      <div class="avatar" :style="`background-image: url(${$addonAssetsUrl}demo-avatar.png`">
        <div class="medal medal-green"></div>
      </div>
      <div class="name">Allen Zhang</div>
    </div>
    <div class="vip-info">{{$t('nurse_booking.vip.info')}}</div>
    <div class="vip-plans">
      <a href="/nurse_booking/vip-details/" class="vip-plan vip-plan-green">
        <div class="vip-plan-badge">{{$t('nurse_booking.vip.current_plan_badge')}}</div>
        <div class="vip-plan-title">{{$t('nurse_booking.vip.plan_green')}}</div>
      </a>
      <a href="/nurse_booking/vip-details/" class="vip-plan vip-plan-gold">
        <div class="vip-plan-badge">{{$t('nurse_booking.vip.recommended_plan_badge')}}</div>
        <div class="vip-plan-title">{{$t('nurse_booking.vip.plan_gold')}}</div>
      </a>
      <a href="/nurse_booking/vip-details/" class="vip-plan vip-plan-platinum">
        <div class="vip-plan-title">{{$t('nurse_booking.vip.plan_platinum')}}</div>
      </a>
    </div>
  </f7-page>
</template>
<script>
  export default {
    beforeDestroy() {
      const self = this;
      self.$f7router.view.$navbarEl.removeClass('nurse-booking__vip-navbar');
    },
    methods: {
      onPageBeforeIn() {
        const self = this;
        self.$f7router.view.$navbarEl.addClass('nurse-booking__vip-navbar');
      },
      onPageBeforeOut(e, page) {
        const self = this;
        if (page.to === 'previous') return;
        self.$f7router.view.$navbarEl.removeClass('nurse-booking__vip-navbar');
      },
    },
  };
</script>

