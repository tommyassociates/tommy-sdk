<template>

  <f7-page name="invoicing__order-details" id="invoicing__order-details" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.order_details.title', 'Order')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>
    <template v-if="order">
      <f7-list class="list-custom">
        <f7-list-item
          v-if="order.created_at"
          :title="$t('invoicing.order_details.created')"
          :after="formatDate(order.created_at)"
        ></f7-list-item>

        <f7-list-item
          :title="$t('invoicing.order_details.due')"
        >
          <input style="text-align: right; height: auto; line-height: 1" slot="after" type="datetime-local" :value="formatValueDate(order.data ? order.data.date : null)" @change="onDateChange">
        </f7-list-item>

        <f7-list-item
          v-if="order.data && order.data.location"
          :title="$t('invoicing.order_details.location')"
          :after="`${order.data.location.address} ${order.data.location.city}`"
        ></f7-list-item>

        <f7-list-item
          :title="$t('invoicing.order_details.status')"
          smart-select
          :smart-select-params="{openIn: 'popover', closeOnSelect: true}"
        >
          <select @change="onStatusChange">
            <option
              v-for="(status, index) in orderStatuses"
              :key="index"
              :value="status"
              :selected="order.status === status"
            >{{$t(`invoicing.order_status.${status}`)}}</option>
          </select>
        </f7-list-item>
        <f7-list-item
          :title="$t('invoicing.order_details.type')"
          smart-select
          :smart-select-params="{openIn: 'popover', closeOnSelect: true}"
        >
          <select @change="onTypeChange">
            <option :selected="!order.quote" value="invoice">{{$t('invoicing.list_edit.type_invoice')}}</option>
            <option :selected="order.quote" value="quote">{{$t('invoicing.list_edit.type_quote')}}</option>
          </select>
        </f7-list-item>

        <f7-list-item
          v-if="order.discount"
          :title="$t('invoicing.order_details.discount')"
          :after="order.discount"
          class="invoicing-money-amount-item"
        ></f7-list-item>
        <f7-list-item
          :title="$t('invoicing.order_details.total')"
          :after="order.total"
          class="invoicing-money-amount-item"
        ></f7-list-item>

        <f7-list-item divider :title="$t('invoicing.order_details.customer')"></f7-list-item>
        <f7-list-item
          :title="orderUserName(order.user_id)"
        >
          <tommy-circle-avatar :url="orderUserAvatar(order.user_id)" slot="media"></tommy-circle-avatar>
        </f7-list-item>

        <f7-list-item divider :title="$t('invoicing.order_details.items')"></f7-list-item>
        <li class="invoicing-order-items" v-if="orderItems">
          <div class="invoicing-order-add-box" @click="productsOpened = true">
            <f7-icon f7="add"></f7-icon>
            <div class="invoicing-order-add-box-placeholder">{{$t('invoicing.order_details.add_item_label')}}</div>
          </div>
          <div class="invoicing-order-item"
            v-for="product in orderItems"
            :key="product.id"
          >
            <div class="invoicing-order-item-name">{{product.name}}</div>
            <div class="invoicing-order-item-details">
              <div class="invoicing-order-item-price">{{product.price}}</div>
              <div class="invoicing-order-item-selector">
                <f7-link icon-f7="delete_round" @click="decreaseOrderItem(product)"></f7-link>
                <div class="invoicing-order-item-qty">{{orderItemsAmount[product.id]}}</div>
                <f7-link icon-f7="add_round_fill" @click="increaseOrderItem(product)"></f7-link>
              </div>
            </div>
          </div>
          <div class="invoicing-order-total">
            <div class="invoicing-order-total-row">
              <div class="invoicing-order-total-label">{{$t('invoicing.order_details.total')}}</div>
              <div class="invoicing-order-total-value">{{orderItemsTotal}}</div>
            </div>
          </div>
        </li>
      </f7-list>
      <f7-popup :opened="productsOpened" @popup:closed="productsOpened = false">
        <f7-view :init="false">
          <f7-page>
            <f7-navbar>
              <f7-nav-right>
                <f7-link popup-close icon-f7="close"></f7-link>
              </f7-nav-right>
              <f7-nav-title>{{$t('invoicing.order_details.add_item_label')}}</f7-nav-title>
            </f7-navbar>
            <f7-searchbar v-if="products" search-container=".invoicing-order-details-products"></f7-searchbar>
            <f7-list v-if="products" class="list-custom invoicing-order-details-products">
              <f7-list-item
                v-for="product in products"
                :key="product.id"
                link
                :title="product.name"
                :after="`¥${product.price}`"
                @click="addOrderItem(product)"
              ></f7-list-item>
            </f7-list>
          </f7-page>
        </f7-view>
      </f7-popup>
    </template>
  </f7-page>
</template>
<script>
  import API from '../api';
  import orderStatuses from '../utils/order-statuses';

  export default {
    props: {
      id: [Number, String],
    },
    data() {
      return {
        order: null,
        showSave: false,
        orderStatuses,
        orderItems: null,
        orderItemsAmount: null,
        products: null,
        productsOpened: false,
      };
    },
    mounted() {
      const self = this;
      API.loadProducts().then((products) => {
        self.products = products;
      });
      API.loadOrder(self.id).then((order) => {
        self.order = order;
        API.loadProduct(self.order.vendor_product_id).then((product) => {
          self.orderItems = {
            [product.id]: product,
          };
          self.orderItemsAmount = {
            [product.id]: 1,
          };
        });
      });
    },
    computed: {
      orderItemsTotal() {
        const self = this;
        if (!self.orderItems || Object.keys(self.orderItems).length === 0) return 0;
        let total = 0;
        Object.keys(self.orderItems).forEach((itemId) => {
          const item = self.orderItems[itemId];
          total += item.price * self.orderItemsAmount[itemId];
        });

        return total;
      },
    },
    methods: {
      orderUserName(user_id) {
        const self = this;
        const user = self.$root.teamMembers.filter(m => m.user_id === parseInt(user_id, 10))[0];
        return `${user.first_name} ${user.last_name}`;
      },
      orderUserAvatar(user_id) {
        const self = this;
        const user = self.$root.teamMembers.filter(m => m.user_id === parseInt(user_id, 10))[0];
        return user.icon_url;
      },
      formatValueDate(date) {
        const self = this;
        if (!date) return '';
        return self.$moment(new Date(parseInt(date, 10))).format('YYYY-MM-DDTHH:mm');
      },
      formatDate(date) {
        const self = this;
        return self.$moment(new Date(date)).format('HH:mm D MMM YYYY');
      },
      onDateChange(e) {
        const self = this;
        const value = e.target.value;
        clearTimeout(self.dateChangeTimeout);
        self.order.data.date = new Date(value).getTime();
        self.dateChangeTimeout = setTimeout(() => {
          self.saveOrder({ data: self.order.data });
        }, 600);
      },
      onStatusChange(e) {
        const self = this;
        self.order.status = e.target.value;
        self.saveOrder({ status: self.order.status });
      },
      onTypeChange(e) {
        const self = this;
        if (e.target.value === 'quote') self.order.quote = true;
        else self.order.quote = false;
        self.saveOrder({ quote: self.order.quote });
      },
      increaseOrderItem(product) {
        const self = this;
        self.orderItemsAmount[product.id] += 1;
        self.showSave = true;
      },
      decreaseOrderItem(product) {
        const self = this;
        self.orderItemsAmount[product.id] -= 1;
        if (self.orderItemsAmount[product.id] === 0) {
          delete self.orderItemsAmount[product.id];
          delete self.orderItems[product.id];
        }
        self.showSave = true;
      },
      addOrderItem(product) {
        const self = this;
        self.productsOpened = false;
        if (self.orderItems[product.id]) return;
        self.$set(self.orderItems, product.id, product);
        self.$set(self.orderItemsAmount, product.id, 1);
      },
      saveOrder(data) {
        const self = this;
        self.$events.$emit('invoicing:reloadListsOrders');
        return API.saveOrder({ ...data, id: self.order.id });
      },
      save() {},
    },
  };
</script>