<template>
  <f7-page name="nurse_booking__service-list" id="nurse_booking__service-list">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t(`nurse_booking.service_list.${category.toLowerCase()}_title`)}}</f7-nav-title>
    </f7-navbar>

    <f7-swiper :params="{
      centeredSlides: true,
      slidesPerView: 'auto',
      touchMoveStopPropagation: false,
    }" class="service-cards no-swipe-panel" v-if="services">
      <f7-swiper-slide
        v-for="service in services"
        :key="`${serviceType(service)}-${service.id}`"
      >
        <a :href="`/nurse_booking/service-details/${service.id}/?type=${serviceType(service)}`" class="service-card">
          <div class="service-card-pic" :style="`background-image:url(${serviceImage(service)})`"></div>
          <div class="service-card-content">
            <div class="service-card-title">{{service.name}}</div>
            <div class="service-card-duration" v-if="service.data.duration">{{service.data.duration}}min</div>
            <div v-if="service.coupons && service.coupons.length" class="service-card-coupons">{{service.coupons.length}} Coupons</div>
            <div v-else class="service-card-price">¥ {{service.price}}</div>
          </div>
        </a>
      </f7-swiper-slide>
    </f7-swiper>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        services: null,
        category: this.$f7route.query.category,
      };
    },
    methods: {
      serviceType(service) {
        return service.vendor_package_products ? 'package' : 'product';
      },
      serviceImage(service) {
        const self = this;
        if (service.image_url) return service.image_url;
        return `${self.$addonAssetsUrl}demo-package.png`;
      },
    },
    mounted() {
      const self = this;
      const teamId = self.$root.team.id;
      Promise.all([API.getServiceList(teamId), API.getCouponList(teamId)]).then(([servicesData, couponsData]) => {
        const services = servicesData.filter(el => el.category === self.category);

        services.forEach((service) => {
          if (service.vendor_package_products) return;
          service.coupons = couponsData.filter(coupon => coupon.vendor_product_id === service.id);
        });

        self.services = services;
      });
    },
  };
</script>

