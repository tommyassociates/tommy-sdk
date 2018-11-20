<template>

  <f7-page name="invoicing__order-details" id="invoicing__order-details" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.order_details.title', 'Order')}} #{{id}}</f7-nav-title>
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
          :title="$t('invoicing.order_details.due_date')"
          link
          :after="formatOrderDate(order.data ? parseInt(order.data.date, 10) : null)"
          @click="openDateSelect"
        ></f7-list-item>
        <f7-list-item
          :title="$t('invoicing.order_details.due_time')"
          link
          :after="formatOrderTime(order.data ? parseInt(order.data.date, 10) : null)"
          @click="openTimeSelect"
        ></f7-list-item>

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

        <f7-list-item divider :title="$t('invoicing.order_details.customer')"></f7-list-item>
        <f7-list-item
          :title="orderUserName(order.user_id)"
        >
          <tommy-circle-avatar :url="orderUserAvatar(order.user_id)" slot="media"></tommy-circle-avatar>
        </f7-list-item>

        <!-- Items -->
        <f7-list-item divider :title="$t('invoicing.order_details.items')"></f7-list-item>
        <li class="invoicing-order-items" v-if="products">
          <div class="invoicing-order-add-box" @click="productsOpened = true">
            <f7-icon f7="add"></f7-icon>
            <div class="invoicing-order-add-box-placeholder">{{$t('invoicing.order_details.add_item_label')}}</div>
          </div>
          <div class="invoicing-order-item"
            v-for="(product, index) in order.vendor_order_items"
            :key="`${product.vendor_product_id}-${index}`"
            v-if="!product._destroy"
          >
            <div class="invoicing-order-item-name">{{productName(product.vendor_product_id)}}</div>
            <div class="invoicing-order-item-details">
              <div class="invoicing-order-item-price">{{productPrice(product.vendor_product_id)}}</div>
              <div class="invoicing-order-item-selector">
                <f7-link icon-f7="delete_round" @click="decreaseOrderItem(index)"></f7-link>
                <div class="invoicing-order-item-qty">{{product.quantity}}</div>
                <f7-link icon-f7="add_round_fill" @click="increaseOrderItem(index)"></f7-link>
              </div>
            </div>
          </div>
          <div class="invoicing-order-total" v-if="orderItemsTotal">
            <div class="invoicing-order-total-row">
              <div class="invoicing-order-total-label">{{$t('invoicing.order_details.total')}}</div>
              <div class="invoicing-order-total-value">{{orderItemsTotal}}</div>
            </div>
          </div>
        </li>

        <!-- Promotions -->
        <f7-list-item divider :title="$t('invoicing.order_details.promotions')"></f7-list-item>
        <li class="invoicing-order-items" v-if="promotions">
          <div class="invoicing-order-add-box" @click="promotionsOpened = true">
            <f7-icon f7="add"></f7-icon>
            <div class="invoicing-order-add-box-placeholder">{{$t('invoicing.order_details.add_promotion_label')}}</div>
          </div>
          <div class="invoicing-order-item"
            v-if="order.vendor_coupon_id"
          >
            <div class="invoicing-order-item-name">{{promotionName(order.vendor_coupon_id)}}</div>
            <div class="invoicing-order-item-details">
              <div class="invoicing-order-item-price">-{{promotionDiscount(order.vendor_coupon_id)}}</div>
              <div class="invoicing-order-item-selector">
                <f7-link icon-f7="delete_round" @click="deleteOrderPromotion()"></f7-link>
              </div>
            </div>
          </div>
          <div class="invoicing-order-total" v-if="orderDiscountTotal">
            <div class="invoicing-order-total-row">
              <div class="invoicing-order-total-label">{{$t('invoicing.order_details.total')}}</div>
              <div class="invoicing-order-total-value">-{{orderDiscountTotal}}</div>
            </div>
          </div>
        </li>
        <!-- Payment -->
        <f7-list-item divider :title="$t('invoicing.order_details.payment')"></f7-list-item>
        <li class="invoicing-order-items" v-if="products && promotions">
          <div class="invoicing-order-total">
            <div class="invoicing-order-total-row" v-if="orderItemsTotal">
              <div class="invoicing-order-total-label">{{$t('invoicing.order_details.items')}}</div>
              <div class="invoicing-order-total-value">{{orderItemsTotal}}</div>
            </div>
            <div class="invoicing-order-total-row" v-if="orderDiscountTotal">
              <div class="invoicing-order-total-label">{{$t('invoicing.order_details.promotions')}}</div>
              <div class="invoicing-order-total-value">-{{orderDiscountTotal}}</div>
            </div>
            <div class="invoicing-order-total-row invoicing-order-final-row">
              <div class="invoicing-order-total-label">{{$t('invoicing.order_details.total')}}</div>
              <div class="invoicing-order-total-value">{{orderTotal}}</div>
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

      <f7-popup :opened="promotionsOpened" @popup:closed="promotionsOpened = false">
        <f7-view :init="false">
          <f7-page>
            <f7-navbar>
              <f7-nav-right>
                <f7-link popup-close icon-f7="close"></f7-link>
              </f7-nav-right>
              <f7-nav-title>{{$t('invoicing.order_details.add_promotion_label')}}</f7-nav-title>
            </f7-navbar>
            <f7-searchbar v-if="promotions" search-container=".invoicing-order-details-products"></f7-searchbar>
            <f7-list v-if="promotions" class="list-custom invoicing-order-details-products">
              <f7-list-item
                v-for="promotion in promotions"
                :key="promotion.id"
                link
                :title="promotion.name"
                :after="`- ¥${promotion.amount}`"
                @click="addOrderPromotion(promotion)"
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
        products: null,
        productsOpened: false,
        promotions: null,
        promotionsOpened: false,
      };
    },
    mounted() {
      const self = this;
      API.loadOrder(self.id).then((order) => {
        self.order = order;
      });
      API.loadProducts().then((products) => {
        self.products = products;
      });
      API.loadPromotions().then((promotions) => {
        self.promotions = promotions;
      });
    },
    beforeDestroy() {
      const self = this;
      if (self.dateCalendar && self.dateCalendar.destroy) self.dateCalendar.destroy();
      if (self.timePicker && self.timePicker.destroy) self.timePicker.destroy();
    },
    computed: {
      orderItemsTotal() {
        const self = this;
        let total = 0;
        self.order.vendor_order_items.forEach((el) => {
          total += self.productPrice(el.vendor_product_id) * el.quantity;
        });
        return total;
      },
      orderDiscountTotal() {
        const self = this;
        let total = 0;
        if (self.order.vendor_coupon_id) {
          const coupon = self.promotions.filter(el => el.id === self.order.vendor_coupon_id)[0];
          if (coupon) {
            total = coupon.amount;
          }
        }
        return total;
      },
      orderTotal() {
        const self = this;
        return Math.max(self.orderItemsTotal - self.orderDiscountTotal, 0);
      },
    },
    methods: {
      openTimeSelect() {
        const self = this;
        const order = self.order;
        if (self.timePicker) {
          self.timePicker.open();
          return;
        }
        const initialValue = self.formatOrderTime(order.data ? parseInt(order.data.date, 10) : null);
        let initiallChanged;
        self.timePicker = self.$f7.picker.create({
          value: initialValue ? initialValue.split(':') : [],
          cols: [
            {
              values: ('00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23').split(' '),
            },
            {
              divider: true,
              content: ' : ',
            },
            {
              values: (() => {
                const m = [];
                for (let i = 0; i <= 59; i += 1) {
                  m.push(i < 10 ? `0${i}` : `${i}`);
                }
                return m;
              })(),
            },
          ],
          on: {
            change(picker, values) {
              if (!initiallChanged) {
                initiallChanged = true;
                return;
              }
              const currentOrderDate = new Date(parseInt(self.order.data.date, 10));
              currentOrderDate.setHours(parseInt(values[0], 10), parseInt(values[1], 10));
              self.order.data.date = currentOrderDate.getTime();
              self.showSave = true;
            },
          },
        });
        self.timePicker.open();
      },
      openDateSelect() {
        const self = this;
        if (self.dateCalendar) {
          self.dateCalendar.open();
          return;
        }
        let initiallChanged;
        self.dateCalendar = self.$f7.calendar.create({
          value: self.order.data.date ? [parseInt(self.order.data.date, 10)] : [],
          on: {
            change(calendar, value) {
              if (!initiallChanged) {
                initiallChanged = true;
                return;
              }

              const currentOrderDate = new Date(parseInt(self.order.data.date, 10));
              const newOrderDate = new Date(value[0]);

              currentOrderDate.setFullYear(newOrderDate.getFullYear());
              currentOrderDate.setMonth(newOrderDate.getMonth());
              currentOrderDate.setDate(newOrderDate.getDate());
              self.order.data.date = currentOrderDate.getTime();
              self.showSave = true;
            },
          },
        });
        self.dateCalendar.open();
      },
      promotionName(id) {
        const self = this;
        return self.promotions.filter(el => el.id === parseInt(id, 10))[0].name;
      },
      promotionDiscount(id) {
        const self = this;
        return self.promotions.filter(el => el.id === parseInt(id, 10))[0].amount;
      },
      productName(id) {
        const self = this;
        return self.products.filter(el => el.id === parseInt(id, 10))[0].name;
      },
      productPrice(id) {
        const self = this;
        return self.products.filter(el => el.id === parseInt(id, 10))[0].price;
      },
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
      onStatusChange(e) {
        const self = this;
        self.order.status = e.target.value;
        self.showSave = true;
      },
      onTypeChange(e) {
        const self = this;
        if (e.target.value === 'quote') self.order.quote = true;
        else self.order.quote = false;
        self.showSave = true;
      },
      increaseOrderItem(index) {
        const self = this;
        self.order.vendor_order_items[index].quantity += 1;
        self.showSave = true;
      },
      decreaseOrderItem(index) {
        const self = this;
        self.order.vendor_order_items[index].quantity -= 1;
        if (self.order.vendor_order_items[index].quantity === 0) {
          if (self.order.vendor_order_items[index].id) {
            self.order.vendor_order_items[index]._destroy = true;
          } else {
            self.order.vendor_order_items.splice(index, 1);
          }
        }
        self.showSave = true;
      },
      addOrderItem(product) {
        const self = this;
        self.productsOpened = false;
        let hasProduct;
        self.order.vendor_order_items.forEach((el) => {
          if (el.vendor_product_id === product.id) hasProduct = true;
        })
        if (hasProduct) return;

        self.order.vendor_order_items.push({
          vendor_product_id: product.id,
          quantity: 1,
        });
        self.showSave = true;
      },
      addOrderPromotion(promotion) {
        const self = this;
        self.promotionsOpened = false;
        self.order.vendor_coupon_id = promotion.id;
        self.showSave = true;
      },
      deleteOrderPromotion() {
        const self = this;
        self.order.vendor_coupon_id = null;
        self.showSave = true;
      },
      save() {
        const self = this;
        const data = { ...self.order };
        self.showSave = false;
        data.vendor_order_items_attributes = [...data.vendor_order_items];
        data.total = self.orderItemsTotal;
        data.discount = self.orderDiscountTotal;
        delete data.vendor_order_items;
        API.saveOrder(data).then((order) => {
          self.order = order;
          self.$events.$emit('invoicing:reloadListsOrders');
        });
      },
    },
  };
</script>