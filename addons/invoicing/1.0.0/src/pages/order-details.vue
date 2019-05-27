<template>
  <f7-popup ref="popup">
    <f7-view :ios-dynamic-navbar="false">
      <f7-page name="invoicing__order-details" id="invoicing__order-details" class="invoicing-page">
        <f7-navbar>
          <!-- <tommy-nav-back></tommy-nav-back> -->
          <f7-nav-left>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-left>
          <f7-nav-title>{{pageTitle}}</f7-nav-title>
          <f7-nav-right>
            <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
          </f7-nav-right>
        </f7-navbar>
        <template v-if="order">
          <f7-list class="list-custom">
            <f7-list-item
              v-if="order.created_at && order.id"
              :title="$t('invoicing.order_details.created')"
              :after="formatDate(order.created_at)"
            ></f7-list-item>

            <f7-list-item
              :title="$t('invoicing.order_details.due_date')"
              :link="true"
              :after="formatOrderDate(order.data ? parseInt(order.data.date, 10) : null)"
              @click="openDateSelect"
            ></f7-list-item>
            <f7-list-item
              :title="$t('invoicing.order_details.due_time')"
              :link="true"
              :after="formatOrderTime(order.data ? parseInt(order.data.date, 10) : null)"
              @click="openTimeSelect"
            ></f7-list-item>

            <f7-list-input
              v-if="order.data && order.data.location"
              :label="$t('invoicing.order_details.city')"
              :placeholder="$t('invoicing.order_details.city_placeholder')"
              type="text"
              :value="order.data.location.city"
              @input="onCityChange"
            ></f7-list-input>

            <f7-list-input
              v-if="order.data && order.data.location"
              :label="$t('invoicing.order_details.address')"
              :placeholder="$t('invoicing.order_details.address_placeholder')"
              type="text"
              :value="order.data.location.address"
              @input="onAddressChange"
            ></f7-list-input>

            <f7-list-item
              :title="$t('invoicing.order_details.status')"
              smart-select
              :smart-select-params="{openIn: 'popover', closeOnSelect: true, routableModals: false}"
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
              :smart-select-params="{openIn: 'popover', closeOnSelect: true, routableModals: false}"
            >
              <select @change="onTypeChange">
                <option :selected="!order.quote" value="invoice">{{$t('invoicing.list_edit.type_invoice')}}</option>
                <option :selected="order.quote" value="quote">{{$t('invoicing.list_edit.type_quote')}}</option>
              </select>
            </f7-list-item>

            <!-- Comments -->
            <f7-list-item divider :title="$t('invoicing.order_details.comment')"></f7-list-item>
            <f7-list-input
              type="textarea"
              :value="order.comment"
              :placeholder="$t('invoicing.order_details.comment_placeholder')"
              @input="onCommentChange"
              resizable
            ></f7-list-input>

            <!-- Customer -->
            <template>
              <f7-list-item divider :title="$t('invoicing.order_details.customer')"></f7-list-item>
              <f7-list-item
                :title="orderUser ? orderUserName : ''"
                smart-select
              >
                <tommy-circle-avatar :data="orderUser" slot="media"></tommy-circle-avatar>
                <select name="customer" @change="onCustomerChange">
                  <option
                    v-for="(contact, index) in contacts"
                    :key="`contact-${index}-${contact.friend_id}`"
                    :value="contact.friend_id"
                    data-option-class="invoicing-smart-select-option"
                    :data-option-image="contact.icon_url"
                    :selected="order.user_id === contact.friend_id"
                  >{{contact.first_name || ''}} {{contact.last_name || ''}}</option>
                  <option
                    v-for="(teamMember,index) in $root.teamMembers"
                    :key="`teamMember-${index}-${teamMember.id}`"
                    :value="teamMember.user_id"
                    data-option-class="invoicing-smart-select-option"
                    :data-option-image="teamMember.icon_url"
                    :selected="order.user_id === teamMember.user_id"
                  >{{teamMember.first_name || ''}} {{teamMember.last_name || ''}}</option>
                </select>
              </f7-list-item>
            </template>


            <!-- Items -->
            <f7-list-item divider :title="$t('invoicing.order_details.items')"></f7-list-item>
            <li class="invoicing-order-items" v-if="products && packages">
              <div class="invoicing-order-add-box" @click="productsOpened = true">
                <f7-icon f7="add"></f7-icon>
                <div class="invoicing-order-add-box-placeholder">{{$t('invoicing.order_details.add_item_label')}}</div>
              </div>
              <div class="invoicing-order-item"
                v-for="(product, index) in order.vendor_order_items"
                :key="`${product.orderable_id}-${index}`"
                v-if="!product._destroy"
              >
                <div class="invoicing-order-item-name">{{productName(product.orderable_id, product.orderable_type)}}</div>
                <div class="invoicing-order-item-details">
                  <div class="invoicing-order-item-price">{{productPrice(product.orderable_id, product.orderable_type)}}</div>
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
            <li class="invoicing-order-items" v-if="products && packages && promotions">
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

            <!-- Time Clocking & Feedback -->
            <template v-if="order && order.data.feedback && products && packages">
              <f7-list-item divider :title="$t('invoicing.order_feedback_results.time_clocking')"></f7-list-item>
              <f7-list-item
                :title="$t('invoicing.order_feedback_results.scheduled')"
                :after="calcOrderDuration()"
              />
              <f7-list-item
                :title="$t('invoicing.order_feedback_results.start')"
                :after="$moment(parseInt(order.data.date, 10)).format('H:mm DD MMM YYYY')"
              />
              <f7-list-item
                :title="$t('invoicing.order_feedback_results.finish')"
                :after="$moment(parseInt(order.data.date, 10) + calcOrderDuration() * 60 * 1000).format('H:mm DD MMM YYYY')"
              />
              <template v-if="order.data.feedback.start_date && order.data.feedback.end_date">
                <f7-list-item divider :title="$t('invoicing.order_feedback_results.time_change')"></f7-list-item>
                <f7-list-item
                  :title="$t('invoicing.order_feedback_results.start')"
                  :after="$moment(order.data.feedback.start_date).format('H:mm DD MMM YYYY')"
                />
                <f7-list-item
                  :title="$t('invoicing.order_feedback_results.finish')"
                  :after="$moment(order.data.feedback.end_date).format('H:mm DD MMM YYYY')"
                />
              </template>
              <template v-if="order.data.feedback.actual_start_date && order.data.feedback.actual_end_date">
                <f7-list-item divider :title="$t('invoicing.order_feedback_results.actual_time')"></f7-list-item>
                <f7-list-item
                  :title="$t('invoicing.order_feedback_results.start')"
                  :after="$moment(order.data.feedback.actual_start_date).format('H:mm DD MMM YYYY')"
                />
                <f7-list-item
                  :title="$t('invoicing.order_feedback_results.finish')"
                  :after="$moment(order.data.feedback.actual_end_date).format('H:mm DD MMM YYYY')"
                />
              </template>

              <f7-list-item divider :title="$t('invoicing.order_feedback_results.feedback')"></f7-list-item>
              <f7-list-item
                :title="$t('invoicing.order_feedback_results.question_1')"
                :after="$t(`invoicing.order_feedback_results.${order.data.feedback.question1}`)"
              />
              <f7-list-item
                :title="$t('invoicing.order_feedback_results.question_2')"
                :after="$t(`invoicing.order_feedback_results.${order.data.feedback.question2}`)"
              />
              <f7-list-item
                :title="$t('invoicing.order_feedback_results.question_3')"
                :after="$t(`invoicing.order_feedback_results.${order.data.feedback.question3}`)"
              />
            </template>
          </f7-list>
          <f7-popup :opened="productsOpened" @popup:closed="productsOpened = false" v-if="products && packages">
            <f7-view :init="false">
              <f7-page class="invoicing-page">
                <f7-navbar>
                  <f7-nav-right>
                    <f7-link @click="productsOpened = false" icon-f7="close"></f7-link>
                  </f7-nav-right>
                  <f7-nav-title>{{$t('invoicing.order_details.add_item_label')}}</f7-nav-title>
                </f7-navbar>
                <f7-searchbar search-container=".invoicing-order-details-items" :disable-button="false"></f7-searchbar>
                <f7-list class="list-custom invoicing-order-details-products invoicing-order-details-items">
                  <f7-list-item divider :title="$t('invoicing.order_details.packages')"></f7-list-item>
                  <f7-list-item
                    v-for="product in packages"
                    :key="product.id"
                    link
                    :title="product.name"
                    :after="`¥${product.price}`"
                    @click="addOrderItem(product, 'VendorPackage')"
                  ></f7-list-item>
                  <f7-list-item divider :title="$t('invoicing.order_details.items')"></f7-list-item>
                  <f7-list-item
                    v-for="product in products"
                    :key="product.id"
                    link
                    :title="product.name"
                    :after="`¥${product.price}`"
                    @click="addOrderItem(product, 'VendorProduct')"
                  ></f7-list-item>
                </f7-list>
              </f7-page>
            </f7-view>
          </f7-popup>

          <f7-popup :opened="promotionsOpened" @popup:closed="promotionsOpened = false" v-if="promotions">
            <f7-view :init="false">
              <f7-page>
                <f7-navbar>
                  <f7-nav-right>
                    <f7-link @click="promotionsOpened = false" icon-f7="close"></f7-link>
                  </f7-nav-right>
                  <f7-nav-title>{{$t('invoicing.order_details.add_promotion_label')}}</f7-nav-title>
                </f7-navbar>
                <f7-searchbar search-container=".invoicing-order-details-promotions" :disable-button="false"></f7-searchbar>
                <f7-list class="list-custom invoicing-order-details-products invoicing-order-details-promotions">
                  <f7-list-item
                    v-for="promotion in promotions"
                    :key="promotion.id"
                    link
                    :title="promotion.name"
                    :after="`- ¥${promotion.kind !== 'percentage' ? promotion.amount : promotion.amount * order.total}`"
                    @click="addOrderPromotion(promotion)"
                  ></f7-list-item>
                </f7-list>
              </f7-page>
            </f7-view>
          </f7-popup>
        </template>
      </f7-page>
    </f7-view>
  </f7-popup>
</template>
<script>
  import API from '../api';
  import orderStatuses from '../utils/order-statuses';

  export default {
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
        productsOpened: false,
        promotions: null,
        promotionsOpened: false,
        isFeedback: false,
        orderUser: null,
        contacts: API.contacts,
      };
    },
    mounted() {
      const self = this;
      if (self.id) {
        API.loadOrder(self.id).then((order) => {
          self.order = order;
          let orderUser = self.$root.teamMembers.filter(m => m.user_id === parseInt(order.user_id, 10))[0];
          if (!orderUser) {
            if (self.contacts) {
              // assuming contact
              orderUser = self.contacts.filter(c => c.friend_id === parseInt(order.user_id, 10))[0];
              self.orderUser = orderUser;
              return;
            }
            self.$api.getContacts.then((contacts) => {
              self.contacts = contacts;
              orderUser = self.contacts.filter(c => c.friend_id === parseInt(order.user_id, 10))[0];
              self.orderUser = orderUser;
            });
            return;
          }
          self.orderUser = orderUser;
        });
      } else {
        self.order = {
          comment: '',
          discount: 0,
          total: 0,
          user_id: null,
          vendor_coupon_id: null,
          vendor_order_items: [],
          wallet_transaction_id: null,
          status: 'pending',
          canceled: false,
          data: {
            location: {
              address: '',
              city: '',
            },
            date: new Date().getTime(),
          },
        };
      }

      API.loadProducts().then((products) => {
        self.products = products;
      });
      API.loadPackages().then((packages) => {
        self.packages = packages;
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
      orderItemsTotal() {
        const self = this;
        let total = 0;
        self.order.vendor_order_items.forEach((el) => {
          total += self.productPrice(el.orderable_id, el.orderable_type) * el.quantity;
        });
        return total;
      },
      orderDiscountTotal() {
        const self = this;
        let total = 0;
        if (self.order.vendor_coupon_id) {
          const coupon = self.promotions.filter(el => el.id === self.order.vendor_coupon_id)[0];
          if (coupon) {
            if (coupon.kind !== 'percentage') {
              total = coupon.amount;
            } else {
              total = self.orderItemsTotal * coupon.amount;
            }
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
      onCustomerChange(e) {
        const self = this;
        const user_id = parseInt(e.target.value, 10);
        let orderUser = self.$root.teamMembers.filter(m => m.user_id === parseInt(user_id, 10))[0];
        if (!orderUser && self.contacts) {
          // assuming contact
          orderUser = self.contacts.filter(c => c.friend_id === parseInt(user_id, 10))[0];
        }
        self.orderUser = orderUser;
        self.order.user_id = parseInt(e.target.value, 10);
        self.showSave = true;
      },
      onCommentChange(e) {
        const self = this;
        self.order.comment = e.target.value;
        self.showSave = true;
      },
      onCityChange(e) {
        const self = this;
        if (!self.order.data) self.order.data = {};
        if (!self.order.data.location) self.order.data.location = {};
        self.order.data.location.city = e.target.value;
        self.showSave = true;
      },
      onAddressChange(e) {
        const self = this;
        if (!self.order.data) self.order.data = {};
        if (!self.order.data.location) self.order.data.location = {};
        self.order.data.location.address = e.target.value;
        self.showSave = true;
      },
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
        const promo = self.promotions.filter(el => el.id === parseInt(id, 10))[0];
        if (!promo) return 0;
        if (promo.kind !== 'percentage') return promo.amount;
        return self.orderItemsTotal * promo.amount;
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
      addOrderItem(product, type) {
        const self = this;
        self.productsOpened = false;
        let hasProduct;
        self.order.vendor_order_items.forEach((el) => {
          if (el.orderable_id === product.id) {
            hasProduct = true;
            if (el._destroy) {
              el._destroy = false;
              delete el._destroy;
              el.quantity = 1;
              self.showSave = true;
            }
          }
        });
        if (hasProduct) return;

        self.order.vendor_order_items.push({
          orderable_id: product.id,
          orderable_type: type,
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
        if (!data.name && data.vendor_order_items.length) {
          data.name = self.productName(data.vendor_order_items[0].orderable_id, data.vendor_order_items[0].orderable_type);
        }
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