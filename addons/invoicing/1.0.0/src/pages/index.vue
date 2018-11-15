<template>
  <f7-page id="invoicing__index" name="invoicing__index" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="/invoicing/settings/" icon-f7="gear"></f7-link>
        <!-- <f7-link href="/invoicing/task-add/" icon-f7="add"></f7-link> -->
      </f7-nav-right>
    </f7-navbar>

    <f7-swiper v-if="orderedLists && orderedLists.length" :params="{
      slidesPerView: 'auto',
      breakpointsInverse: true,
      centeredSlides: false,
      breakpoints: {
        768: {
          centeredSlides: true,
        }
      },
    }">
      <f7-swiper-slide
        v-for="list in orderedLists"
        :key="list.id"
      >
        <div class="orders-list" :data-id="list.id" :class="{'hasScroll': listWithScroll[list.id]}">
          <div class="orders-list-header">
            <div>{{list.name}}</div>
            <div v-if="canEditList(list)">
              <a :href="`/invoicing/list-edit/${list.id}/`">
                <img
                  :src="`${$addonAssetsUrl}slice6.png`"
                  :srcset="`${$addonAssetsUrl}slice6@2x.png 2x, ${$addonAssetsUrl}slice6@3x.png 3x`"
                >
              </a>
            </div>
          </div>
          <div class="orders-list-content">
            <template v-if="list.orders && list.orders.length">
              <a v-for="(order, index) in list.orders" :key="index" :href="`/invoicing/order-details/${order.id}/`" class="card invoicing-order-card">
                <div class="card-header">
                  <span class="order-date" v-if="order.data && order.data.date">{{orderDate(order.data ? order.data.date : null)}}</span>
                  <span class="order-status">{{$t(`invoicing.order_status.${order.status}`)}}</span>
                </div>
                <div class="card-content">
                  <f7-list class="no-hairlines no-hairlines-between">
                    <f7-list-item
                      v-if="order.user_id"
                      :title="orderUserName(order.user_id)"
                    >
                      <img :src="`${$addonAssetsUrl}icon-user.svg`" slot="media">
                    </f7-list-item>
                    <f7-list-item
                      :title="order.name"
                    >
                      <img :src="`${$addonAssetsUrl}icon-product.svg`" slot="media">
                    </f7-list-item>
                    <f7-list-item
                      v-if="order.total"
                      :title="order.total"
                    >
                      <img :src="`${$addonAssetsUrl}icon-money.svg`" slot="media">
                    </f7-list-item>
                    <f7-list-item
                      v-if="order.data && order.data.location"
                      :title="`${order.data.location.address} ${order.data.location.city}`"
                    >
                      <img :src="`${$addonAssetsUrl}icon-location.svg`" slot="media">
                    </f7-list-item>
                  </f7-list>
                </div>
              </a>
            </template>
          </div>
        </div>
      </f7-swiper-slide>
    </f7-swiper>
  </f7-page>
</template>
<script>
  import API from '../api';
  import humanTime from '../utils/human-time';

  export default {
    data() {
      const self = this;
      return {
        lists: null,
        actorId: self.$f7route.query.actor_id,
        listWithScroll: {},
      };
    },
    created() {
      const self = this;
      if (self.actorId) {
        API.actorId = parseInt(self.actorId, 10);
        API.actor = self.actor;
      } else {
        delete API.actorId;
        delete API.actor;
      }
    },
    computed: {
      actor() {
        const self = this;
        if (!self.actorId) return null;
        return self.$root.teamMembers.filter(user => user.user_id === parseInt(self.actorId, 10))[0];
      },
      pageTitle() {
        const self = this;
        if (!self.actorId) return self.$t('invoicing.index.title', 'Orders');
        const actorName = self.$root.teamMembers.filter(user => user.user_id === parseInt(self.actorId, 10))[0].first_name;
        return self.$t('invoicing.index.title_user', { user: actorName });
      },
      orderedLists() {
        const self = this;
        if (!self.lists) return null;
        return self.lists.sort((a, b) => {
          return a.data.position - b.data.position;
        }).filter(list => list.data.active);
      },
    },
    methods: {
      humanTime,
      orderDate(date) {
        const self = this;
        if (!date) return '';
        return self.$moment(parseInt(date, 10)).format('D MMM YYYY');
      },
      orderUserName(user_id) {
        const self = this;
        const user = self.$root.teamMembers.filter(m => m.user_id === parseInt(user_id, 10))[0];
        if (!user) return '';
        return `${user.first_name} ${user.last_name}`;
      },
      listHasScroll(list) {
        const self = this;
        if (!list.orders || list.orders.length === 0) return false;
        const listContentEl = self.$$(`.orders-list[data-id="${list.id}"] .orders-list-content`)[0];
        if (!listContentEl) return false;
        return listContentEl.scrollHeight > listContentEl.offsetHeight;
      },
      loadListOrders(list) {
        const self = this;
        API.loadListOrders(list).then((orders) => {
          list.orders = orders;
          self.$nextTick(() => {
            if (self.listHasScroll(list)) {
              self.$set(self.listWithScroll, list.id, true);
            } else {
              self.$set(self.listWithScroll, list.id, false);
            }
          });
        });
      },
      reloadListsOrders() {
        const self = this;
        if (!self.lists) return;
        self.lists.forEach((list) => {
          self.loadListOrders(list);
        });
      },
      loadLists(ignoreCache) {
        const self = this;
        API.loadLists({}, { cache: !ignoreCache }).then((lists) => {
          lists.forEach((list) => {
            list.orders = [];
          });
          self.lists = lists;
          self.lists.forEach((list) => {
            if (!list.data.active) return;
            self.loadListOrders(list);
          });
        });
      },
      reloadLists() {
        const self = this;
        self.loadLists(true);
      },
      canEditList(list) {
        const self = this;
        const account = self.$root.account;
        const isOwnerOrManager = (account.type === 'Team') || (account.type === 'TeamMember');

        if (list.data.default && !isOwnerOrManager) return false;

        if (list.permission_to.indexOf('update') !== -1) return true;
        return false;
      },
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off('invoicing:reloadListsOrders', self.reloadListsOrders);
      self.$events.$off('invoicing:reloadLists', self.reloadLists);
    },
    mounted() {
      const self = this;
      self.loadLists();
      self.$events.$on('invoicing:reloadListsOrders', self.reloadListsOrders);
      self.$events.$on('invoicing:reloadLists', self.reloadLists);
    },
  };
</script>

