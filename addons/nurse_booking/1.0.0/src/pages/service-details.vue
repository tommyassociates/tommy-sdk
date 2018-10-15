<template>
  <f7-page name="nurse_booking__service-details" id="nurse_booking__service-details">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{service.name}}</f7-nav-title>
    </f7-navbar>
    <a class="nurse_booking__toolbar-button" @click="book" slot="fixed">{{$t('nurse_booking.service_details.book_button')}}</a>

    <div class="service-details-header">
      <f7-swiper pagination>
        <div class="swiper-slide" :style="`background-image: url(${$addonAssetUrl}demo-package.png)`"></div>
        <div class="swiper-slide" :style="`background-image: url(${$addonAssetUrl}demo-package.png)`"></div>
        <div class="swiper-slide" :style="`background-image: url(${$addonAssetUrl}demo-package.png)`"></div>
      </f7-swiper>
    </div>
    <div class="service-details-meta">
      <div class="service-details-meta-wrap">
        <div class="service-details-meta-left">
          <div class="service-details-title">{{service.name}}</div>
          <div class="service-details-duration">{{service.data.duration}}min</div>
        </div>
        <div class="service-details-price">¥ {{service.price}}</div>
      </div>
      <a v-if="service.coupons.length" class="service-details-coupons-link" @click="chooseCoupon"><span>{{service.coupons.length}} coupons available</span></a>
    </div>
    <div class="service-details-content">
      <div class="service-details-label">{{$t('nurse_booking.service_details.service_details_label')}}:</div>
      <div class="service-details-text">
        <p>
          {{service.description}}
        </p>
      </div>
    </div>
  </f7-page>
</template>
<script>
  import API from '../api';
  import couponPicker from '../coupon-picker';

  export default {
    props: {
      id: [Number, String],
    },
    data() {
      const self = this;
      let service = {};
      (API.cache.services || []).forEach((serviceData) => {
        if (serviceData.id === parseInt(self.id, 10)) {
          service = serviceData;
          service.coupons = API.cache.coupons.filter(coupon => coupon.vendor_product_id === service.id);
        }
      });
      return {
        service,
        selectedCoupon: null,
      };
    },
    mounted() {
      // const self = this;
    },
    methods: {
      book() {
        const self = this;
        const service = self.service;
        API.cache.booking.service = service;

        if (service.coupons && service.coupons.length) {
          couponPicker(service.coupons, (coupon) => {
            self.selectedCoupon = coupon;
            API.cache.booking.service = service;
            API.cache.booking.coupon = self.selectedCoupon;
            self.$f7router.navigate('/nurse_booking/locations/');
          }, () => {
            API.cache.booking.coupon = null;
            delete API.cache.booking.coupon;
            self.selectedCoupon = null;
            self.$f7router.navigate('/nurse_booking/locations/');
          });
        } else {
          API.cache.booking.coupon = null;
          delete API.cache.booking.coupon;
          self.selectedCoupon = null;
          self.$f7router.navigate('/nurse_booking/locations/');
        }
      },
      chooseCoupon() {
        const self = this;
        const service = self.service;
        couponPicker(service.coupons, (coupon) => {
          self.selectedCoupon = coupon;
          API.cache.booking.service = self.service;
          API.cache.booking.coupon = self.selectedCoupon;
          self.$f7router.navigate('/nurse_booking/locations/');
        }, () => {
          self.selectedCoupon = null;
        });
      },
    },
  };
</script>

