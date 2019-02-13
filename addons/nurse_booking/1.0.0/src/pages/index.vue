<template>
  <f7-page name="nurse_booking__index" id="nurse_booking__index" @page:beforein="onPageBeforeIn" @page:beforeout="onPageBeforeOut">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('nurse_booking.index.title', 'Nurse Booking')}}</f7-nav-title>
    </f7-navbar>

    <f7-swiper pagination ref="swiper">
      <f7-swiper-slide class="swiper-slide" :style="`background-image: url(${$addonAssetUrl}demo-slide.jpg)`"></f7-swiper-slide>
      <f7-swiper-slide class="swiper-slide" :style="`background-image: url(${$addonAssetUrl}demo-slide.jpg)`"></f7-swiper-slide>
      <f7-swiper-slide class="swiper-slide" :style="`background-image: url(${$addonAssetUrl}demo-slide.jpg)`"></f7-swiper-slide>
    </f7-swiper>

    <div class="sections">
      <!-- <div class="section">
        <a href="/nurse_booking/vip/">
          <img :src="`${$addonAssetUrl}icon-vip.svg`" />
          <span>{{$t('nurse_booking.index.vip_label', 'VIP')}}</span>
        </a>
      </div> -->
      <div class="section">
        <a href="/nurse_booking/service-list/?category=Nursing&masterDetailRoot=true" data-reload-detail="true">
          <img :src="`${$addonAssetUrl}icon-nursing.svg`" />
          <span>{{$t('nurse_booking.index.nursing_label', 'Nursing')}}</span>
        </a>
      </div>
      <div class="section">
        <a href="/nurse_booking/service-list/?category=Cleaning&masterDetailRoot=true" data-reload-detail="true">
          <img :src="`${$addonAssetUrl}icon-cleaning.svg`" />
          <span>{{$t('nurse_booking.index.cleaning_label', 'Cleaning')}}</span>
        </a>
      </div>
      <div class="section">
        <a href="/nurse_booking/service-list/?category=Massage&masterDetailRoot=true" data-reload-detail="true">
          <img :src="`${$addonAssetUrl}icon-massage.svg`" />
          <span>{{$t('nurse_booking.index.massage_label', 'Massage')}}</span>
        </a>
      </div>
      <div class="section">
        <a href="/nurse_booking/history/?masterDetailRoot=true" data-reload-detail="true">
          <img :src="`${$addonAssetUrl}icon-booking.svg`" />
          <span>{{$t('nurse_booking.index.booking_label', 'Booking')}}</span>
        </a>
      </div>
      <div class="section">
        <a href="tommy://addon?package=wallet&back=true" class="external">
          <img :src="`${$addonAssetUrl}icon-wallet.svg`" />
          <span>{{$t('nurse_booking.index.wallet_label', 'Wallet')}}</span>
        </a>
      </div>
    </div>
  </f7-page>
</template>
<script>
  export default {
    beforeDestroy() {
      const self = this;
      self.$f7router.view.$navbarEl.removeClass('nurse-booking-index-navbar');
    },
    mounted() {
      const self = this;
      if (self.$refs.swiper && self.$refs.swiper.swiper) {
        self.$nextTick(() => {
          self.$refs.swiper.swiper.update();
        });
      }
    },
    methods: {
      onPageBeforeIn() {
        const self = this;
        self.$f7router.view.$navbarEl.addClass('nurse-booking-index-navbar');
      },
      onPageBeforeOut() {
        const self = this;
        self.$f7router.view.$navbarEl.removeClass('nurse-booking-index-navbar');
      },
    },
  };
</script>

