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
      <div class="service-image" :style="`background-image: url(${$addonAssetUrl}demo-package.png)`"></div>
      <div class="service-details">
        <div class="service-title">{{service.name}}</div>
        <div class="service-price">¥{{service.price}}</div>
      </div>
    </div>
    <f7-list no-hairlines>
      <f7-list-item
        v-if="nurse"
        :title="`${nurse.first_name} ${nurse.last_name}`"
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
        v-if="coupon"
        link="#"
        :title="$t('nurse_booking.order_confirm.coupons_label')"
        :after="`-¥${coupon.amount}`"
        @click="selectCoupon"
      ></f7-list-item>
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
  import payOrder from '../pay-order';
  import formatDate from '../format-date';

  export default {
    data() {
      const self = this;

      return {
        service: API.cache.booking.service,
        coupon: API.cache.booking.coupon,
        user: self.$root.user,
        location: API.cache.booking.location,
        date: API.cache.booking.date,
        nurse: API.cache.booking.nurse,
      };
    },
    computed: {
      total() {
        const self = this;
        const { service, coupon } = self;
        return service.price - (coupon ? coupon.amount : 0);
      },
    },
    methods: {
      formatDate,
      selectCoupon() {
        const self = this;
        couponPicker(self.service.coupons, (coupon) => {
          API.cache.booking.coupon = coupon;
          self.coupon = coupon;
        }, () => {}, self.coupon);
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
        const { service, coupon, location, date, total, nurse } = self;

        payOrder({
          teamId: self.$root.team.id,
          productName: service.name,
          productId: service.id,
          total,
          couponId: coupon ? coupon.id : null,
          discount: coupon ? coupon.amount : 0,
          location,
          date,
          nurse,
        });
      },
    },
  };
</script>

