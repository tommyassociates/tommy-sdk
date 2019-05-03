<template>
  <f7-page name="nurse_booking__history" id="nurse_booking__history">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t(`nurse_booking.history.title`)}}</f7-nav-title>
    </f7-navbar>

    <div class="orders-list" v-if="ordersSorted">
      <a
        v-for="(order, index) in ordersSorted"
        :key="index"
        :href="`/nurse_booking/order-details/?id=${order.id}`"
        class="order-item"
      >
        <div class="order-item-header">
          <div class="order-item-date">{{formatDate(order.data.date, 'D MMM YYYY')}}</div>
          <div class="order-item-status">{{$t(order.statusKey)}}</div>
        </div>
        <div class="order-item-content">
          <div class="order-item-details">
            <div class="order-item-details-row">{{order.name}}</div>
            <div class="order-item-details-row order-item-details-date">{{formatDate(order.data.date, 'MMM D, YYYY H:mm')}}</div>
          </div>
          <div class="order-item-amount">¥{{order.total}}</div>
        </div>
      </a>
    </div>

  </f7-page>
</template>
<script>
  import API from '../api';
  import formatDate from '../format-date';

  export default {
    data() {
      return {
        orders: null,
      };
    },
    computed: {
      ordersSorted() {
        if (!this.orders) return null;
        return this.orders.sort((a, b) => {
          if (b.id > a.id) return 1;
          if (b.id < a.id) return -1;
          return 0;
        });
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
      API.getOrdersHistory(teamId).then((orders) => {
        orders.forEach((order) => {
          order.statusKey = `nurse_booking.history.status_${order.canceled ? 'canceled' : order.status}`;
          if (order.data && order.data.date) {
            if (!Number.isNaN(parseInt(order.data.date, 10))) {
              order.data.date = parseInt(order.data.date, 10);
            }
          }
        });
        self.orders = orders;
      });
    },
    methods: {
      formatDate,
    },
  };
</script>

