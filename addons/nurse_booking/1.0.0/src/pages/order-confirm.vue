<template>
  <f7-page name="nurse_booking__order-confirm" id="nurse_booking__order-confirm" @page:beforein="onPageBeforeIn">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t(`nurse_booking.order_confirm.title`)}}</f7-nav-title>
    </f7-navbar>

    <a
      slot="fixed"
      class="nurse_booking__toolbar-button service-book-button"
      href="#"
      @click="payOrder"
    >{{$t('nurse_booking.order_confirm.pay_button')}}</a>

    <div class="service-details-block">
      <div class="service-image" :style="`background-image: url(${serviceImage})`"></div>
      <div class="service-details">
        <div class="service-title">{{serviceName}}</div>
        <div class="service-price">¥{{servicePrice}}</div>
      </div>
    </div>
    <f7-list no-hairlines>
      <f7-list-item
        v-if="nurse"
        :title="`${nurse.last_name} ${nurse.first_name}`"
        :link="`/nurse_booking/order-select-nurse/?nurse_id=${nurse.id}&back=true`"
      >
        <img slot="media" :src="`${$addonAssetsUrl}icon-nurse.svg`">
      </f7-list-item>
      <f7-list-item
        :title="formatDate(date, 'MMMM D, YYYY HH:mm')"
        :link="`/nurse_booking/order-select-date/?date=${new Date(date).getTime()}&back=true`"
      >
        <img slot="media" :src="`${$addonAssetsUrl}icon-time.svg`">
      </f7-list-item>
    </f7-list>

    <f7-list no-hairlines>
      <f7-list-item
        :title="`${user.first_name} ${user.last_name}`"
      >
        <img slot="media" :src="`${$addonAssetsUrl}icon-user.svg`">
      </f7-list-item>
      <f7-list-item
        v-if="user.mobile"
        :title="user.mobile"
      >
        <img slot="media" :src="`${$addonAssetsUrl}icon-phone.svg`">
      </f7-list-item>
      <f7-list-item
        link="/nurse_booking/order-select-location/?back=true"
      >
        <span class="location-default-badge" slot="title">[{{$t('nurse_booking.location.default_label')}}]</span>
        <span slot="title">{{location.city}} {{location.address}}</span>
        <img slot="media" :src="`${$addonAssetsUrl}icon-location.svg`">
      </f7-list-item>
    </f7-list>

    <f7-list class="list-prices" no-hairlines>
      <f7-list-item
        v-if="coupons && coupons.length"
        link="#"
        :title="$t('nurse_booking.order_confirm.coupons_label')"
        :after="`-¥ ${couponDiscount}`"
        @click="selectCoupon"
      ></f7-list-item>
      <!-- v-for="coupon in coupons" -->
      <!-- :after="`${coupon.kind !== 'percentage' ? `-¥${couponDiscount}` : `-${coupon.amount * 100}%`}`" -->

      <f7-list-item
        class="item-total-price"
        :title="$t('nurse_booking.order_confirm.total_label')"
        :after="`¥${total}`"
      ></f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';
  import couponPicker from '../coupon-picker';
  import calculateOrder from '../calculate-order';
  import payOrder from '../pay-order';
  import formatDate from '../format-date';

  export default {
    data() {
      const self = this;

      return {
        services: API.cache.booking.services,
        coupons: API.cache.booking.coupons,
        user: self.$root.user,
        location: API.cache.booking.location,
        date: API.cache.booking.date,
        nurse: API.cache.booking.nurse,
      };
    },
    computed: {
      monies() {
        return calculateOrder(this)
      },
      couponDiscount() {
        return this.monies.discount;
        // const self = this;
        // const { coupons, services } = self;
        // let discount = 0;
        // if (coupons) {
        //   coupons.forEach((coupon) => {
        //     discount += coupon.kind !== 'percentage' ? coupon.amount : coupon.amount * self.servicePrice;
        //   });
        // }
        // // if (coupon) {
        // //   discount = coupon.kind !== 'percentage' ? coupon.amount : coupon.amount * self.servicePrice;
        // // }
        // if (discount > self.servicePrice) discount = self.servicePrice;
        // return discount;
      },
      total() {
        return this.monies.total;
        // return calculateOrder(this)
        // const self = this;
        // return Math.max(self.servicePrice - self.couponDiscount, 0);
      },
      servicePrice() {
        return this.monies.subtotal;
        // const self = this;
        // const { services } = self;
        // let price = 0;
        // services.forEach((service) => {
        //   price += service.price;
        // });
        // return price;
      },
      serviceImage() {
        const self = this;
        const service = self.services[0];
        if (service.image_url) return service.image_url;
        return `${self.$addonAssetsUrl}demo-package.png`;
      },
      serviceName() {
        const self = this;
        return self.services.map(el => el.name).join(', ');
      },
    },
    methods: {
      formatDate,

      selectCoupon() {
        const self = this;
        const service = self.services[0];
        couponPicker(service.coupons, self.coupons, (coupon) => {
          // API.cache.booking.coupon = coupon;
          // self.coupon = coupon;
        }, () => {}); //, self.coupon
      },
      onPageBeforeIn(e, page) {
        const self = this;
        if (page.from === 'previous') {
          self.location = API.cache.booking.location;
          self.date = API.cache.booking.date;
          self.nurse = API.cache.booking.nurse;
        }
      },
      payOrder() {
        const self = this;
        const { services, coupons, location, date, total, nurse } = self;
        const vendor_order_items_attributes = self.services.map((el) => {
          return {
            orderable_id: el.id,
            orderable_type: el.package_products ? 'Vendor::Package' : 'Vendor::Product',
            quantity: el.quantity || 1,
          };
        });
        const teamId = self.$root.team ? self.$root.team.id : self.$addons.addons.nurse_booking.data.nursing_team_id;

        let duration = 0;
        services.forEach((el) => {
          if (el.data && el.data.duration) duration += parseInt(el.data.duration, 10);
        });
        if (!duration) duration = 60;

        let discount = 0;
        // if (coupon) discount = self.couponDiscount;

        payOrder({
          vendor_order_items_attributes,
          teamId,
          productName: services.map(el => el.name).join(', '),
          productId: services[0].id,
          total,
          couponIds: coupons ? coupons.map(x => x.id) : null,
          discount,
          location,
          date,
          nurse,
          duration,
        });
      },
    },
  };
</script>
