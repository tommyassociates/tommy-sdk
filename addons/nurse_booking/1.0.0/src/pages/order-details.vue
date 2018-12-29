<template>
  <f7-page name="nurse_booking__order-details" id="nurse_booking__order-details">
    <f7-navbar>
      <tommy-nav-back v-if="$f7route.query.backToHome" href="/nurse_booking/" force></tommy-nav-back>
      <tommy-nav-back v-else></tommy-nav-back>
      <f7-nav-title>{{$t(`nurse_booking.order_details.title`)}}</f7-nav-title>
    </f7-navbar>

    <template v-if="status">
      <div class="order-details-status" v-if="status.canceled">
        <div class="order-details-status-title">{{$t('nurse_booking.order_details.status_canceled')}}</div>
        <div class="order-details-status-date">{{formatDate(date, 'D MMM. YYYY')}}</div>
        <img :src="`${$addonAssetsUrl}icon-status-canceled.svg`">
      </div>
      <div class="order-details-status" v-if="status.pending">
        <div class="order-details-status-title">{{$t('nurse_booking.order_details.status_pending')}}</div>
        <div class="order-details-status-date">{{formatDate(date, 'D MMM. YYYY')}}</div>
        <img :src="`${$addonAssetsUrl}icon-status-pending.svg`">
      </div>
      <div class="order-details-status" v-if="status.progress">
        <div class="order-details-status-title">{{$t('nurse_booking.order_details.status_progress')}}</div>
        <div class="order-details-status-date">{{formatDate(date, 'D MMM. YYYY')}}</div>
        <img :src="`${$addonAssetsUrl}icon-status-progress.svg`">
      </div>
      <div class="order-details-status" v-if="status.complete">
        <div class="order-details-status-title">{{$t('nurse_booking.order_details.status_complete')}}</div>
        <div class="order-details-status-date">{{formatDate(date, 'D MMM. YYYY')}}</div>
        <img :src="`${$addonAssetsUrl}icon-status-complete.svg`">
      </div>
    </template>

    <f7-list class="order-details-list" v-if="services" no-hairlines>
      <f7-list-item
        v-if="nurse"
        :title="`${nurse.first_name} ${nurse.last_name}`"
      >
        <span :style="`background-image: url(${nurse.icon_url || ''})`" class="order-details-list-nurse-avatar" slot="media"></span>
      </f7-list-item>
      <f7-list-item
        :title="`${$t('nurse_booking.order_details.service_label')}:`"
        :after="serviceName"
      ></f7-list-item>
      <f7-list-item
        :title="`${$t('nurse_booking.order_details.time_label')}:`"
        :after="formatDate(date, 'MMMM D, YYYY HH:mm')"
      ></f7-list-item>
      <li class="item-content" v-if="coupon">
        <div class="item-inner">
          <div class="item-title">{{$t('nurse_booking.order_details.coupons_label')}}:</div>
          <div class="item-after price">-¥{{coupon.amount}}</div>
        </div>
      </li>
      <li class="item-content item-total-price">
        <div class="item-inner">
          <div class="item-title">{{$t('nurse_booking.order_details.total_label')}}:</div>
          <div class="item-after price">¥{{total}}</div>
        </div>
      </li>
      <f7-list-item
        class="item-total-price"
        :title="`${$t('nurse_booking.order_details.payment_label')}:`"
        :after="transaction ? transaction.card_name : null"
      ></f7-list-item>

      <template v-if="status">
        <a v-if="status.progress" href="#" class="order-details-white-button" @click="cancelOrder">{{$t('nurse_booking.order_details.cancel_button')}}</a>
        <a v-if="status.pending" href="#" class="order-details-red-button" @click="payOrder">{{$t('nurse_booking.order_details.pay_button')}}</a>
        <a v-if="status.complete || status.canceled" href="#" class="order-details-red-button" @click="repeatOrder">{{$t('nurse_booking.order_details.repeat_button')}}</a>
      </template>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';
  import payOrder from '../pay-order';
  import formatDate from '../format-date';

  export default {
    data() {
      const self = this;
      const { transaction, services, coupon, location, date, nurse } = API.cache.booking;
      const data = {
        teamId: self.$root.team ? self.$root.team.id : self.$root.addons.nurse_booking.data.nursing_team_id,
        transaction: null,
        services: null,
        coupon: null,
        location: null,
        date: null,
        order: null,
        status: null,
        total: null,
        preventCancel: false,
        nurse: null,
      };
      if (!self.$f7route.query.id) {
        Object.assign(data, {
          transaction,
          services,
          coupon,
          location,
          date,
          nurse,
        });
      }
      return data;
    },
    computed: {
      totalComputed() {
        const self = this;
        const { services, coupon, total } = self;
        let servicesTotal = 0;
        services.forEach((el) => {
          servicesTotal += el.price;
        });
        return total || (servicesTotal - (coupon ? coupon.amount : 0));
      },
      serviceName() {
        const self = this;
        return self.services.map(el => el.name).join(', ');
      },
    },
    mounted() {
      const self = this;
      if (!self.$f7route.query.id) return;
      API.getOrderDetails(self.teamId, self.$f7route.query.id).then((order) => {
        self.order = order;
        const canceled = order.canceled;
        self.status = {
          pending: !canceled && order.status === 'pending',
          canceled,
          progress: !canceled && (order.status === 'paid' || order.status === 'processing'),
          complete: !canceled && order.status === 'complete',
        };
        self.date = parseInt(order.data.date, 10);
        self.nurse = order.data.nurse;
        self.transaction = {
          card_name: order.wallet_transaction.card_name,
        };
        self.total = order.total;
        if (order.vendor_coupon_id) {
          self.coupon = {
            id: order.vendor_coupon_id,
            amount: order.discount,
          };
        }
        Promise.all(order.vendor_order_items.map((el) => {
          return API.getServiceDetails(self.teamId, el.orderable_id, el.orderable_type).then((service) => {
            service.quantity = el.quantity;
            return Promise.resolve(service);
          });
        })).then((services) => {
          self.services = services;
        });
      });
    },
    methods: {
      formatDate,
      repeatOrder() {
        const self = this;
        const { order, services } = self;
        if (!order) return;

        API.cache.booking.date = parseInt(order.data.date, 10);
        API.cache.booking.location = order.data.location;
        API.cache.booking.nurse = order.data.nurse;
        API.cache.booking.vendor_order_items_attributes = order.vendor_order_items.map((el) => {
          return {
            vendor_product_id: el.vendor_product_id,
            orderable_id: el.vendor_product_id,
            orderable_type: el.vendor_package_products ? 'VendorPackage' : 'VendorProduct',
            quantity: el.quantity,
          };
        });
        delete API.cache.booking.coupon;

        API.cache.booking.services = services;
        self.$f7router.navigate('/nurse_booking/order-confirm/');
      },
      cancelOrder() {
        const self = this;
        const { order } = self;
        if (!order) return;
        if (self.preventCancel) return;
        self.preventCancel = true;

        self.$f7.dialog.confirm(
          `
          <div class="order-details-cancel-order-icon"></div>
          <div>${self.$t('nurse_booking.order_details.cancel_confirm')}</div>
          `,
          () => {
            API.cancelOrder(self.teamId, order.id)
              .then(() => {
                return API.deleteBookingEvent(order.id);
              })
              .then(() => {
                self.preventCancel = false;
                self.$f7router.navigate('/nurse_booking/order-canceled/');
              })
              .catch(() => {
                self.preventCancel = false;
              });
          },
          () => {
            self.preventCancel = false;
          }
        );
      },
      payOrder() {
        const self = this;
        const { order } = self;
        payOrder({
          teamId: self.teamId,
          vendor_order_items_attributes: (order.vendor_order_items || []).map((el) => {
            return {
              orderable_id: el.vendor_product_id,
              orderable_type: el.vendor_package_products ? 'VendorPackage' : 'VendorProduct',
              quantity: el.quantity,
            };
          }),
          orderId: order.id,
          productName: order.name,
          productId: order.vendor_product_id || order.vendor_order_items[0],
          total: order.total,
          couponId: order.vendor_coupon_id,
          discount: order.discount,
          location: order.data.location,
          date: order.data.date,
          nurse: order.data.nurse,
        }, false);
      },
    },
  };
</script>