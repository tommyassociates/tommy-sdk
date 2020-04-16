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
      <!-- <li class="item-content" v-if="coupons">
        <div class="item-inner">
          <div class="item-title">{{$t('nurse_booking.order_details.coupons_label')}}:</div>
          <div class="item-after price">-¥{{coupons.amount}}</div>
        </div>
      </li> -->

      <li class="item-content item-total-price" v-if="discount">
        <div class="item-inner">
          <div class="item-title">{{$t('nurse_booking.order_details.coupons_label')}}:</div>
          <div class="item-after price">¥{{discount}}</div>
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
        :after="transaction && transaction.card_name ? transaction.card_name : null"
      ></f7-list-item>

      <template v-if="status">
        <a v-if="status.pending" href="#" class="order-details-red-button" @click="payOrder">{{$t('nurse_booking.order_details.pay_button')}}</a>
        <a v-if="status.complete || status.canceled" href="#" class="order-details-red-button" @click="repeatOrder">{{$t('nurse_booking.order_details.repeat_button')}}</a>
        <a v-if="status.pending || status.progress" href="#" class="order-details-white-button" @click="cancelOrder">{{$t('nurse_booking.order_details.cancel_button')}}</a>
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
      const { transaction, services, coupons, location, date, nurse } = API.cache.booking;
      const data = {
        teamId: self.$root.team ? self.$root.team.id : self.$addons.addons.nurse_booking.data.nursing_team_id,
        transaction: null,
        services: null,
        coupons: null,
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
          coupons,
          location,
          date,
          nurse,
        });
      }
      return data;
    },
    computed: {
      // totalComputed() {
      //   return calculateOrder(self)
      //   // const self = this;
      //   // const { services, coupons, total } = self;
      //   // let servicesTotal = 0;
      //   // services.forEach((el) => {
      //   //   servicesTotal += el.price;
      //   // });
      //   // let discount = 0;
      //   // if (coupons) discount = coupons.kind !== 'percentage' ? coupons.amount : coupons.amount * servicesTotal;
      //   // return total || Math.max((servicesTotal - discount), 0);
      // },
      serviceName() {
        const self = this;
        return self.services.map(el => el.name).join(', ');
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
          card_name: order.wallet_transaction ? order.wallet_transaction.card_name : null,
        };
        self.discount = order.discount;
        self.total = order.total;
        // if (order.vendor_coupon_ids) {
        //   self.coupons = {
        //     id: order.vendor_coupons_id,
        //     kind: 'fixed',
        //     amount: order.discount,
        //   };
        // }
        // self.coupons = []
        // API.getCouponList(self.teamId).then((coupons) => {
        //   coupons.forEach(coupon => {
        //     if (order.vendor_coupon_ids.some(x => x.id === coupon.id)) {
        //       self.coupons.push(coupon)
        //     }
        //   });
        // });
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
            orderable_type: el.package_products ? 'Vendor::Package' : 'Vendor::Product',
            quantity: el.quantity,
          };
        });
        delete API.cache.booking.coupons;

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
            API.cancelOrder(self.teamId, order.id, order.wallet_transaction_id, order)
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
              orderable_type: el.package_products ? 'Vendor::Package' : 'Vendor::Product',
              quantity: el.quantity,
            };
          }),
          orderId: order.id,
          productName: order.name,
          productId: order.vendor_product_id || order.vendor_order_items[0],
          total: order.total,
          couponsIds: order.vendor_coupons_ids,
          discount: order.discount,
          location: order.data.location,
          date: order.data.date,
          nurse: order.data.nurse,
          duration: order.data.duration,
        }, false);
      },
    },
  };
</script>
