<template>
  <f7-page id="invoicing__promotion-details" data-name="invoicing__promotion-details" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="list-custom" v-if="item">
      <f7-list-input
        :label="$t('invoicing.promotion.name_label', 'Name')"
        :placeholder="$t('invoicing.promotion.name_placeholder', 'Enter promotion name')"
        type="text"
        :value="item.name"
        @input="($event) => {item.name = $event.target.value; enableSave()}"
      ></f7-list-input>

      <!-- Description -->
      <f7-list-item divider :title="$t('invoicing.promotion.description_label', 'Description')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.promotion.description_placeholder', 'Enter promotion description')"
        type="textarea"
        resizable
        :value="item.description"
        @input="($event) => {item.description = $event.target.value; enableSave()}"
      ></f7-list-input>

      <!-- Date -->
      <f7-list-item divider :title="$t('invoicing.promotion.expires_label', 'Description')"></f7-list-item>
      <f7-list-input
        class="invoicing-valid-to-input"
        :title="$t('invoicing.order_details.due_date')"
        type="text"
        readonly
        :value="item.valid_to ? $moment(item.valid_to).format('D MMM YYYY') : ''"
        @focus="openCalendar"
      >
        <span slot="inner" class="input-clear-button margin-right" @click="item.valid_to = null; enableSave();"></span>
      </f7-list-input>


      <!-- Kind -->
      <f7-list-item divider :title="$t('invoicing.promotion.type_label')"></f7-list-item>
      <f7-list-item
        checkbox
        :title="$t('invoicing.promotion.type_voucher_label')"
        :checked="item.kind === 'voucher'"
        @change="setKind('voucher')"
      />
      <f7-list-item
        checkbox
        :title="$t('invoicing.promotion.type_fixed_label')"
        :checked="item.kind === 'fixed'"
        @change="setKind('fixed')"
      />
      <f7-list-item
        checkbox
        :title="$t('invoicing.promotion.type_percentage_label')"
        :checked="item.kind === 'percentage'"
        @change="setKind('percentage')"
      />

      <!-- Discount -->
      <f7-list-item divider :title="$t('invoicing.promotion.amount_label', 'Discount amount')"></f7-list-item>
      <f7-list-input
        v-if="item.kind === 'fixed' || item.kind === 'voucher'"
        :placeholder="$t('invoicing.promotion.amount_placeholder', 'Enter promotion discount')"
        type="text"
        :value="item.amount ? `¥${item.amount}` : ''"
        @input="setAmount($event.target.value)"
      ></f7-list-input>
      <f7-list-item
        v-if="item.kind === 'percentage'"
      >
        <f7-range
          class="invoicing-range-slider"
          :value="item.amount"
          :min="0"
          :max="1"
          :step="0.01"
          :format-label="(v) => `${Math.floor(v * 100)}%`"
          label
          @range:changed="(v) => setAmount(v)"
        />
        <div class="invoicing-range-slider-value">{{Math.floor(item.amount * 100)}}%</div>
      </f7-list-item>

      <!-- Category -->
      <f7-list-item divider :title="$t('invoicing.promotion.category_label', 'Category')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.promotion.category_label', 'Category')"
        type="text"
        :value="item.category"
        @input="($event) => {item.category = $event.target.value; enableSave()}"
      ></f7-list-input>

      <!-- Max uses -->
      <f7-list-item divider :title="$t('invoicing.promotion.max_uses_label')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.promotion.max_uses_placeholder')"
        type="number"
        :value="item.max_uses"
        @input="($event) => {item.max_uses = $event.target.value; enableSave()}"
      ></f7-list-input>

      <!-- Customer -->
      <template v-if="contacts">
        <f7-list-item divider :title="$t('invoicing.promotion.customer_label', 'Customer')"></f7-list-item>
        <f7-list-item
          :title="customerTitle"
          link
          @click="customerPopupOpened = true"
        >
          <tommy-circle-avatar v-if="customerAvatar" :data="customerAvatar" slot="media"></tommy-circle-avatar>
        </f7-list-item>
      </template>

      <!-- Item -->
      <f7-list-item divider :title="$t('invoicing.promotion.item_label', 'Item')"></f7-list-item>
      <f7-list-item
        v-if="products && packages"
        :title="itemTitle"
        link
        @click="itemsPopupOpened = true"
      >
        <tommy-circle-avatar v-if="itemAvatar" :url="itemAvatar" slot="media"></tommy-circle-avatar>
      </f7-list-item>

      <!-- coupon switch -->
      <!-- <f7-list-item divider title="111"></f7-list-item> -->
      <f7-list-item>
        <span>{{$t('invoicing.promotion.valid')}}</span>
        <f7-toggle :checked="couponValid" @change="toggleCouponValid" color="#FF5413"></f7-toggle>
      </f7-list-item>
    </f7-list>

    <!-- Customer Popup -->
    <f7-popup :opened="customerPopupOpened" @popup:closed="customerPopupOpened = false" v-if="item">
      <f7-view :init="false">
        <f7-page class="invoicing-page">
          <f7-navbar>
            <f7-nav-title>{{$t('invoicing.promotion.customer_label')}}</f7-nav-title>
            <f7-nav-right>
              <f7-link popup-close icon-f7="close"></f7-link>
            </f7-nav-right>
          </f7-navbar>
          <f7-searchbar search-container=".invoicing-promotion-customers-list"></f7-searchbar>
          <f7-list
            class="invoicing-promotion-customers-list"
            virtual-list
            :virtual-list-params="{
              items: contactsSorted,
              searchAll: contactsSearchAll,
              renderExternal: contactsRenderExternal,
              height: 65,
            }"
          >
            <ul>
              <f7-list-item
                v-for="(contact, index) in contactsVlData.items"
                :key="`contact-${index}-${contact.friend_id || contact.id}`"
                :title="`${contact.first_name || ''} ${contact.last_name || ''}`"
                :virtual-list-index="contactsSorted.indexOf(item)"
                :checked="contact.friend_id ? item.user_id === contact.friend_id : item.user_id === contact.user_id"
                :style="`top: ${contactsVlData.topPosition}px`"
                radio
                @click="() => {item.user_id = contact.friend_id || contact.user_id; customerPopupOpened = false; enableSave()}"
              >
                <tommy-circle-avatar :data="contact" slot="media"></tommy-circle-avatar>
              </f7-list-item>
            </ul>
          </f7-list>
        </f7-page>
      </f7-view>
    </f7-popup>

    <!-- Item Popup -->
    <f7-popup :opened="itemsPopupOpened" @popup:closed="itemsPopupOpened = false" v-if="item && products && packages">
      <f7-view :init="false">
        <f7-page class="invoicing-page">
          <f7-navbar>
            <f7-nav-title>{{$t('invoicing.promotion.item_label')}}</f7-nav-title>
            <f7-nav-right>
              <f7-link popup-close icon-f7="close"></f7-link>
            </f7-nav-right>
          </f7-navbar>
          <f7-searchbar search-container=".invoicing-promotion-items-list" :disable-button="false"></f7-searchbar>
          <f7-list class="invoicing-promotion-items-list">
            <f7-list-item v-if="products.length" divider :title="$t('invoicing.item_service_management.items_tab')" />
            <f7-list-item
              v-for="product in products"
              :key="product.id"
              :title="product.name"
              @click="() => {item.vendor_product_id = product.id; item.vendor_package_id = null; itemsPopupOpened = false; enableSave()}"
              radio
              :checked="item.vendor_product_id === product.id"
            >
              <tommy-circle-avatar :url="product.image_url" slot="media"></tommy-circle-avatar>
            </f7-list-item>
            <f7-list-item  v-if="packages.length" divider :title="$t('invoicing.item_service_management.packages_tab')" />
            <f7-list-item
              v-for="pkg in packages"
              :key="pkg.id"
              :title="pkg.name"
              @click="() => {item.vendor_product_id = null; item.vendor_package_id = pkg.id; itemsPopupOpened = false; enableSave()}"
              radio
              :checked="item.vendor_package_id === pkg.id"
            >
              <tommy-circle-avatar :url="pkg.image_url" slot="media"></tommy-circle-avatar>
            </f7-list-item>
          </f7-list>
        </f7-page>
      </f7-view>
    </f7-popup>
  </f7-page>
</template>
<script>
  import tagSelect from '../components/tag-select.vue';
  import API from '../api';

  export default {
    components: {
      tagSelect,
    },
    props: {
      id: [String, Number],
    },
    data() {
      const self = this;
      return {
        pageTitle: self.$f7route.query.title || self.$t('invoicing.promotion.new_title'),
        item: null,
        showSave: false,
        customerPopupOpened: false,
        itemsPopupOpened: false,
        products: null,
        packages: null,
        contacts: API.contacts,
        couponValid: true,
        contactsVlData: {
          items: [],
        },
      };
    },
    mounted() {
      const self = this;
      if (!self.id) {
        self.item = {
          // expire_at: '',
          description: '',
          name: '',
          amount: 0,
          user_id: null,
          vendor_product_id: null,

          vendor_package_id: null,
          category: null,
          kind: 'fixed',
          valid_from: null,
          valid_to: null,
          max_uses: null,
          used: !self.couponValid,
        };
      } else {
        API.loadPromotion(self.id).then((item) => {
          self.item = item;
          self.couponValid = self.item.used ? !self.item.used : self.couponValid;
        });
      }

      if (!self.contacts) {
        self.$api.getContacts.then((contacts) => {
          self.contacts = contacts;
          API.contacts = contacts;
        });
        return;
      }

      Promise.all([
        API.loadProducts(),
        API.loadPackages(),
      ]).then(([products, packages]) => {
        self.products = products;
        self.packages = packages;
      });
    },
    computed: {
      contactsSorted() {
        const self = this;
        return [
          ...(self.contacts || []),
          ...self.$root.teamMembers,
        ];
      },
      customerAvatar() {
        const self = this;
        if (!self.item.user_id) return null;
        let user;
        if (self.$root.teamMembers) {
          user = self.$root.teamMembers.filter(m => m.user_id === self.item.user_id)[0];
        }
        if (!user && self.contacts) {
          // assuming contact
          user = self.contacts.filter(c => c.friend_id === self.item.user_id)[0];
        }
        if (!user) return null;
        return user;
      },
      customerTitle() {
        const self = this;
        if (!self.item.user_id) return self.$t('invoicing.promotion.customer_placeholder');
        let user;
        if (self.$root.teamMembers) {
          user = self.$root.teamMembers.filter(m => m.user_id === self.item.user_id)[0];
        }
        if (!user && self.contacts) {
          // assuming contact
          user = self.contacts.filter(c => c.friend_id === self.item.user_id)[0];
        }
        if (!user) return '';
        return `${user.first_name || ''} ${user.last_name || ''}`;
      },
      itemAvatar() {
        const self = this;
        if (!self.item.vendor_product_id && !self.item.vendor_package_id) return null;
        let product;
        if (self.item.vendor_product_id) {
          product = self.products.filter(p => p.id === self.item.vendor_product_id)[0];
        }
        if (self.item.vendor_package_id) {
          product = self.packages.filter(p => p.id === self.item.vendor_package_id)[0];
        }
        if (!product) return null;
        return product.image_url;
      },
      itemTitle() {
        const self = this;
        if (!self.item.vendor_product_id && !self.item.vendor_package_id) return self.$t('invoicing.promotion.item_placeholder');
        let product;
        if (self.item.vendor_product_id) {
          product = self.products.filter(p => p.id === self.item.vendor_product_id)[0];
        }
        if (self.item.vendor_package_id) {
          product = self.packages.filter(p => p.id === self.item.vendor_package_id)[0];
        }
        if (!product) return '';
        return product.name;
      },
    },
    methods: {
      contactsSearchAll(query, items) {
        const found = [];
        console.log(query);
        for (let i = 0; i < items.length; i += 1) {
          const name = `${items[i].first_name || ''} ${items[i].last_name || ''}`;
          if (name.toLowerCase().indexOf(query.toLowerCase()) >= 0 || query.trim() === '') found.push(i);
        }
        console.log(found);
        return found; // return array with mathced indexes
      },
      contactsRenderExternal(vl, vlData) {
        this.contactsVlData = vlData;
      },
      toggleCouponValid() {
        this.couponValid = !this.couponValid;
        this.item.used = !this.couponValid;
        this.enableSave();
      },
      openCalendar() {
        const self = this;
        self.calendarTo = self.$f7.calendar.create({
          openIn: 'customModal',
          value: self.item.valid_to ? [new Date(self.item.valid_to)] : [],
          backdrop: true,
          closeByOutsideClick: false,
          on: {
            change(c, v) {
              self.item.valid_to = self.$moment(new Date(v[0])).format();
              self.enableSave();
            },
          },
        });
        self.calendarTo.once('closed', () => {
          self.calendarTo.destroy();
        });
        self.calendarTo.open();
      },
      formatValueDate(date) {
        const self = this;
        if (!date) return '';
        return self.$moment(new Date(date)).format('YYYY-MM-DDTHH:mm');
      },
      onDateChange(e) {
        const self = this;
        const value = e.target.value;
        clearTimeout(self.dateChangeTimeout);
        self.item.valid_to = new Date(value).toJSON();
        self.enableSave();
      },
      setKind(kind) {
        const self = this;
        const prevKind = self.item.kind;
        if (self.item.kind === kind) return;
        if ((kind === 'fixed' || kind === 'voucher') && prevKind === 'percentage') {
          self.setAmount(0);
        } else if (kind === 'percentage') {
          self.setAmount(0.5);
        }
        self.item.kind = kind;
        self.enableSave();
      },
      setAmount(value) {
        const self = this;
        let newAmount = value;
        if (typeof newAmount === 'string') {
          newAmount = value.replace(/[¥ ]*/, '').replace(/,/g, '.').trim();
        } else { // eslint-disable-next-line
          if (newAmount >= 1) {
            newAmount = 1;
          } else {
            newAmount = Math.floor(newAmount * 1000 / 10);
            if (newAmount < 10) newAmount = parseFloat(`0.0${newAmount}`);
            else newAmount = parseFloat(`0.${newAmount}`);
          }
        }
        if (newAmount < 0) {
          this.$f7.dialog.alert(this.$t('invoicing.promotion_management.wrong_amount'));
          return;
        }
        self.item.amount = newAmount;
        self.$set(self.item, 'amount', newAmount);
        self.enableSave();
      },
      enableSave() {
        const self = this;
        self.showSave = true;
      },
      save() {
        const self = this;
        self.showSave = false;
        if (typeof self.item.amount === 'string') {
          self.item.amount = parseFloat(self.item.amount);
          if (Number.isNaN(self.item.amount)) {
            self.item.amount = 0;
          }
        }
        if (self.item.vendor_product_id) {
          self.item.vendor_package_id = null;
        }
        if (self.item.vendor_package_id) {
          self.item.vendor_product_id = null;
        }
        API.savePromotion(self.item).then(() => {
          self.$events.$emit('invoicing:reloadPromotions');
          self.$f7router.back();
        });
      },
    },
  };
</script>