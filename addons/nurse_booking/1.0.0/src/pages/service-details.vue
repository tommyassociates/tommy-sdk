<template>
  <f7-page name="nurse_booking__service-details" id="nurse_booking__service-details">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{service.name}}</f7-nav-title>
    </f7-navbar>
    <a class="nurse_booking__toolbar-button" @click="book" slot="fixed">{{$t('nurse_booking.service_details.book_button')}}</a>

    <div class="service-details-header">
      <f7-swiper>
        <div class="swiper-slide" :style="`background-image: url(${serviceImage(service)})`"></div>
      </f7-swiper>
    </div>
    <div class="service-details-meta">
      <div class="service-details-meta-wrap">
        <div class="service-details-meta-left">
          <div class="service-details-title">{{service.name}}</div>
          <div class="service-details-duration" v-if="service.data && service.data.duration">{{service.data.duration}}min</div>
        </div>
        <div class="service-details-price">¥ {{service.price}}</div>
      </div>
      <a v-if="service.coupons && service.coupons.length" class="service-details-coupons-link" @click="chooseCoupon"><span>{{service.coupons.length}} coupons available</span></a>
    </div>
    <div class="service-details-content">
      <div class="service-details-label">{{$t('nurse_booking.service_details.service_details_label')}}:</div>
      <div class="service-details-text">
        <p>
          {{service.description}}
        </p>
      </div>
      <div class="service-details-products" v-if="products">
        <div
          class="service-details-product"
          v-for="product in products"
          :key="product.id"
        >
          <div class="service-details-product-image" :style="`background-image: url(${serviceImage(product)})`"></div>
          <div class="service-details-product-name">{{product.name}}</div>
        </div>
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
      const type = self.$f7route.query.type || 'product';
      let service = {};
      let products = null;
      (API.cache.services || []).forEach((serviceData) => {
        const serviceType = serviceData.vendor_package_products ? 'package' : 'product';
        if (serviceData.id === parseInt(self.id, 10) && serviceType === type) {
          service = serviceData;
          if (serviceType === 'product') {
            service.coupons = API.cache.coupons.filter(coupon => coupon.vendor_product_id === service.id);
          }
        }
      });
      if (service.vendor_package_products && service.vendor_package_products.length) {
        products = service.vendor_package_products.map((product) => {
          return (API.cache.services || []).filter((s) => {
            return s.id === product.vendor_product_id && !s.vendor_package_products;
          })[0];
        });
      }
      return {
        service,
        selectedCoupon: null,
        type,
        products,
      };
    },
    mounted() {
      // const self = this;
    },

    methods: {
      serviceImage(service) {
        const self = this;
        if (service.image_url) return service.image_url;
        return `${self.$addonAssetsUrl}demo-package.png`;
      },
      book() {
        const self = this;
        const service = self.service;
        API.cache.booking.services = [service];
        API.cache.booking.serviceType = self.type;

        if (service.coupons && service.coupons.length) {
          couponPicker(service.coupons, (coupon) => {
            self.selectedCoupon = coupon;
            API.cache.booking.services = [service];
            API.cache.booking.coupon = self.selectedCoupon;
            self.$f7router.navigate('/nurse_booking/order-select-location/');
          }, () => {
            API.cache.booking.coupon = null;
            delete API.cache.booking.coupon;
            self.selectedCoupon = null;
            self.$f7router.navigate('/nurse_booking/order-select-location/');
          });
        } else {
          API.cache.booking.coupon = null;
          delete API.cache.booking.coupon;
          self.selectedCoupon = null;
          self.$f7router.navigate('/nurse_booking/order-select-location/');
        }
      },
      chooseCoupon() {
        const self = this;
        const service = self.service;
        couponPicker(service.coupons, (coupon) => {
          self.selectedCoupon = coupon;
          API.cache.booking.services = [self.service];
          API.cache.booking.coupon = self.selectedCoupon;
          self.$f7router.navigate('/nurse_booking/order-select-location/');
        }, () => {
          self.selectedCoupon = null;
        });
      },
    },
  };
</script>

