<template>
  <f7-page name="nurse_booking__service-list" id="nurse_booking__service-list">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t(`nurse_booking.service_list.${category.toLowerCase()}_title`)}}</f7-nav-title>
    </f7-navbar>
    <div class="nurse_booking__empty-placeholder" v-if="services && !services.length">
      {{$t('nurse_booking.service_list.empty_label')}}
    </div>
    <f7-swiper
      v-if="services && services.length"
      class="service-cards no-swipe-panel"
      :params="{
        centeredSlides: true,
        slidesPerView: 'auto',
        touchMoveStopPropagation: false,
        on: {
          tap: onSlideClick
        },
      }"
    >
      <f7-swiper-slide
        v-for="service in services"
        :key="`${serviceType(service)}-${service.id}`"
        :data-url="`/nurse_booking/service-details/${service.id}/?type=${serviceType(service)}`"
      >
        <a href="#" class="service-card">
          <div class="service-card-pic" :style="`background-image:url(${serviceImage(service)})`"></div>
          <div class="service-card-content">
            <div class="service-card-title">{{service.name}}</div>
            <div class="service-card-duration" v-if="service.data && service.data.duration">{{service.data.duration}}min</div>
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
  import cnCategories from '../cn-categories';
  import couponsForService from '../coupons-for-service';

  export default {
    data() {
      return {
        services: null,
        category: this.$f7route.query.category,
      };
    },
    methods: {
      onSlideClick(e) {
        const self = this;
        const url = self.$$(e.target).closest('.swiper-slide').attr('data-url');
        if (!url) return;
        self.$f7router.navigate(url);
      },
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
      if (self.$f7route.query.masterDetailRoot) {
        const navbarEl = self.$f7.navbar.getElByPage(self.$el);
        if (navbarEl) {
          self.$$(navbarEl).addClass('navbar-master-detail-root');
        }
      }
      const teamId = self.$root.team ? self.$root.team.id : self.$addons.addons.nurse_booking.data.nursing_team_id;
      Promise
        .all([API.getServiceList(teamId), API.getCouponList(teamId)])
        .then(([servicesData, couponsData]) => {
          const services = servicesData.filter(el => el.category === self.category || el.category === cnCategories[self.category]);
          services.forEach((service) => {
            service.coupons = couponsForService(service, couponsData, self.$root.user.id);
          });

          self.services = services;
        });
    },
  };
</script>

