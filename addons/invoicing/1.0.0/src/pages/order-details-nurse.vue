<template>
  <f7-popup ref="popup">
    <f7-view :ios-dynamic-navbar="false">
      <order-feedback
        v-if="isFeedback"
        :order="order"
        :orderDuration="orderDuration"
        @feedbackComplete="onFeedbackComplete"
        @close="onFeedbackClose"
      />
      <f7-page v-if="!isFeedback" name="invoicing__order-details" id="invoicing__order-details" class="invoicing-page">
        <f7-navbar>
          <f7-nav-left>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-left>
          <f7-nav-title>{{pageTitle}}</f7-nav-title>
          <f7-nav-right>
            <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
          </f7-nav-right>
        </f7-navbar>
        <div
          class="invoicing-toolbar-button"
          slot="fixed"
          v-if="order && showStartButton"
          @click="startOrder"
        >{{$t('invoicing.order_details.start_button')}}</div>
        <div
          class="invoicing-toolbar-button"
          slot="fixed"
          v-if="order && showFinishButton"
          @click="finishOrder"
        >{{$t('invoicing.order_details.finish_button')}}</div>
        <template v-if="order">
          <f7-list class="list-custom">
            <f7-list-item
              :title="$t('invoicing.order_details.due_date')"
              :link="false"
              :after="formatOrderDate(order.data ? parseInt(order.data.date, 10) : null)"
            ></f7-list-item>
            <f7-list-item
              :title="$t('invoicing.order_details.due_time')"
              :link="false"
              :after="formatOrderTime(order.data ? parseInt(order.data.date, 10) : null)"
            ></f7-list-item>

            <f7-list-item
              v-if="order.data && order.data.location"
              :title="$t('invoicing.order_details.city')"
              type="text"
              :after="order.data.location.city"
            ></f7-list-item>

            <f7-list-item
              v-if="order.data && order.data.location"
              :title="$t('invoicing.order_details.address')"
              type="text"
              :after="order.data.location.address"
            ></f7-list-item>

            <!-- Comments -->
            <f7-list-item divider :title="$t('invoicing.order_details.comment')" v-if="order.comment"></f7-list-item>
            <f7-list-input
              v-if="order.comment"
              type="textarea"
              :value="order.comment"
              :placeholder="$t('invoicing.order_details.comment_placeholder')"
              resizable
              :readonly="true"
            ></f7-list-input>

            <!-- Customer -->
            <template v-if="orderUser">
              <f7-list-item divider :title="$t('invoicing.order_details.customer')"></f7-list-item>
              <f7-list-item
                :title="orderUserName"
                :link="`/contact-details/?user_id=${order.user_id}&masterDetailRoot=true`"
                view=".view-main"
                :reload-all="true"
              >
                <tommy-circle-avatar :data="orderUser" slot="media"></tommy-circle-avatar>
              </f7-list-item>
            </template>

            <!-- Items -->
            <f7-list-item divider :title="$t('invoicing.order_details.items')"></f7-list-item>
            <li class="invoicing-order-items" v-if="products && packages">
              <div class="invoicing-order-item"
                v-for="(product, index) in order.vendor_order_items"
                :key="`${product.orderable_id}-${index}`"
                v-if="!product._destroy"
              >
                <div class="invoicing-order-item-name">{{productName(product.orderable_id, product.orderable_type)}}</div>
              </div>
            </li>
          </f7-list>
        </template>
      </f7-page>
    </f7-view>
  </f7-popup>
</template>
<script>
  import API from '../api';
  import orderStatuses from '../utils/order-statuses';
  import OrderFeedback from '../components/order-feedback.vue';

  export default {
    components: {
      OrderFeedback,
    },
    props: {
      id: [Number, String],
    },
    data() {
      const self = this;
      return {
        pageTitle: self.id ? `${self.$t('invoicing.order_details.title', 'Order')} #${self.id}` : self.$t('invoicing.order_details.new_title'),
        order: null,
        showSave: false,
        orderStatuses,
        products: null,
        packages: null,
        isFeedback: false,
        orderDuration: 0,
        orderUser: null,
      };
    },
    mounted() {
      const self = this;
      Promise.all([
        API.loadOrder(self.id, self.$root.team.id).then((order) => {
          self.order = order;
          const orderUser = self.$root.teamMembers.filter(m => m.user_id === parseInt(order.user_id, 10))[0];
          if (!orderUser) {
            // assuming contact
            self.$api.getContact(order.user_id).then((contact) => {
              self.orderUser = contact;
            });
          } else {
            self.orderUser = orderUser;
          }
        }),
        API.loadProducts().then((products) => {
          self.products = products;
        }),
        API.loadPackages().then((packages) => {
          self.packages = packages;
        }),
      ]).then(() => {
        self.orderDuration = self.calcOrderDuration();
      });
    },
    computed: {
      orderUserName() {
        const self = this;
        const user = self.orderUser;
        if (!user) return '';
        if (user.friend_team_name) {
          return user.friend_team_name.trim();
        }
        if (user.name) return user.name.trim();
        if (user.first_name) return `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`.trim();
        return '';
      },
      showStartButton() {
        const self = this;
        if (self.order.status !== 'paid') return false;
        const orderDate = new Date(parseInt(self.order.data.date, 10)).getTime();
        const now = new Date().getTime();
        const diffMinutes = (orderDate - now) / 1000 / 60;
        if (Math.abs(diffMinutes) <= 60) return true;
        return false;
      },
      showFinishButton() {
        const self = this;
        return self.order.status === 'processing';
      },
      orderItemsTotal() {
        const self = this;
        let total = 0;
        self.order.vendor_order_items.forEach((el) => {
          total += self.productPrice(el.orderable_id, el.orderable_type) * el.quantity;
        });
        return total;
      },
    },
    methods: {
      calcOrderDuration() {
        const self = this;
        let duration = 0;
        if (self.order && self.products && self.packages) {
          self.order.vendor_order_items.forEach((el) => {
            duration += self.productDuration(el.orderable_id, el.orderable_type) * el.quantity;
          });
        }
        return duration;
      },
      productName(id, type = 'VendorProduct') {
        const self = this;
        const product = self[type === 'VendorProduct' ? 'products' : 'packages'].filter(el => el.id === parseInt(id, 10))[0];
        return product ? product.name : '';
      },
      productPrice(id, type = 'VendorProduct') {
        const self = this;
        const product = self[type === 'VendorProduct' ? 'products' : 'packages'].filter(el => el.id === parseInt(id, 10))[0];
        return product ? product.price : 0;
      },
      productDuration(id, type = 'VendorProduct') {
        const self = this;
        const product = self[type === 'VendorProduct' ? 'products' : 'packages'].filter(el => el.id === parseInt(id, 10))[0];
        return product ? parseInt(product.data.duration, 10) : 0;
      },
      formatOrderDate(date) {
        const self = this;
        if (!date) return '';
        return self.$moment(new Date(parseInt(date, 10))).format('D MMM YYYY');
      },
      formatOrderTime(date) {
        const self = this;
        if (!date) return '';
        return self.$moment(new Date(parseInt(date, 10))).format('HH:mm');
      },
      formatDate(date) {
        const self = this;
        return self.$moment(new Date(date)).format('HH:mm D MMM YYYY');
      },
      startOrder() {
        const self = this;
        const data = { ...self.order };
        data.status = 'processing';
        if (!data.data.feedback) data.data.feedback = {};
        data.data.feedback.actual_start_date = new Date().toJSON();
        API.saveOrder(data, self.$root.team.id).then((order) => {
          self.order = order;
          self.$events.$emit('invoicing:reloadListsOrders');
        });
      },
      finishOrder() {
        const self = this;
        self.$refs.popup.f7Popup.params.closeByBackdropClick = false;
        self.isFeedback = true;
      },
      onFeedbackComplete(obj) {
        const self = this;
        const feedback = obj.feedback;
        const data = { ...self.order };
        data.status = 'complete';
        if (!data.data.feedback) data.data.feedback = feedback;
        else Object.assign(data.data.feedback, feedback);
        data.data.feedback.actual_end_date = new Date().toJSON();
        delete data.vendor_order_items;
        API.saveOrder(data, self.$root.team.id).then((order) => {
          self.order = order;
          self.$events.$emit('invoicing:reloadListsOrders');
          if (obj.callback) obj.callback();
        });
      },
      onFeedbackClose() {
        const self = this;
        self.isFeedback = false;
        self.$refs.popup.f7Popup.close();
      },
    },
  };
</script>