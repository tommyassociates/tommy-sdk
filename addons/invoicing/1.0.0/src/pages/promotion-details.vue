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
        :title="$t('invoicing.order_details.due')"
        type="datetime-local"
        :value="formatValueDate(item.expire_at)"
        @change="onDateChange"
      >
      </f7-list-input>

      <!-- Discount -->
      <f7-list-item divider :title="$t('invoicing.promotion.amount_label', 'Discount amount')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.promotion.amount_placeholder', 'Enter promotion discount')"
        type="text"
        :value="item.amount ? `¥${item.amount}` : ''"
        @input="setDiscount($event.target.value)"
      ></f7-list-input>

      <!-- Customer -->
      <f7-list-item divider :title="$t('invoicing.promotion.customer_label', 'Customer')"></f7-list-item>
      <f7-list-item
        :title="customerTitle"
        link
        @click="customerPopupOpened = true"
      >
        <tommy-circle-avatar v-if="customerAvatar" :data="customerAvatar" slot="media"></tommy-circle-avatar>
      </f7-list-item>

      <!-- Item -->
      <f7-list-item divider :title="$t('invoicing.promotion.item_label', 'Item')"></f7-list-item>
      <f7-list-item
        v-if="products"
        :title="itemTitle"
        link
        @click="itemsPopupOpened = true"
      >
        <tommy-circle-avatar v-if="itemAvatar" :url="itemAvatar" slot="media"></tommy-circle-avatar>
      </f7-list-item>
    </f7-list>

    <!-- Customer Popup -->
    <f7-popup :opened="customerPopupOpened" @popup:closed="customerPopupOpened = false" v-if="item">
      <f7-view :init="false">
        <f7-page>
          <f7-navbar>
            <f7-nav-title>{{$t('invoicing.promotion.customer_label')}}</f7-nav-title>
            <f7-nav-right>
              <f7-link popup-close icon-f7="close"></f7-link>
            </f7-nav-right>
          </f7-navbar>
          <f7-searchbar search-container=".invoicing-promotion-customers-list"></f7-searchbar>
          <f7-list class="invoicing-promotion-customers-list">
            <f7-list-item
              v-for="(contact, index) in contacts"
              :key="`contact-${index}-${contact.friend_id}`"
              :title="`${contact.first_name || ''} ${contact.last_name || ''}`"
              @click="() => {item.user_id = contact.friend_id; customerPopupOpened = false; enableSave()}"
              radio
              :checked="item.user_id === contact.friend_id"
            >
              <tommy-circle-avatar :data="contact" slot="media"></tommy-circle-avatar>
            </f7-list-item>
            <f7-list-item
              v-for="user in $root.teamMembers"
              :key="`user-${index}-${user.id}`"
              :title="`${user.first_name || ''} ${user.last_name || ''}`"
              @click="() => {item.user_id = user.user_id; customerPopupOpened = false; enableSave()}"
              radio
              :checked="item.user_id === user.user_id"
            >
              <tommy-circle-avatar :data="user" slot="media"></tommy-circle-avatar>
            </f7-list-item>
          </f7-list>
        </f7-page>
      </f7-view>
    </f7-popup>

    <!-- Item Popup -->
    <f7-popup :opened="itemsPopupOpened" @popup:closed="itemsPopupOpened = false" v-if="item && products">
      <f7-view :init="false">
        <f7-page>
          <f7-navbar>
            <f7-nav-title>{{$t('invoicing.promotion.item_label')}}</f7-nav-title>
            <f7-nav-right>
              <f7-link popup-close icon-f7="close"></f7-link>
            </f7-nav-right>
          </f7-navbar>
          <f7-searchbar search-container=".invoicing-promotion-items-list" :disable-button="false"></f7-searchbar>
          <f7-list class="invoicing-promotion-items-list">
            <f7-list-item
              v-for="product in products"
              :key="product.id"
              :title="product.name"
              @click="() => {item.vendor_product_id = product.id; itemsPopupOpened = false; enableSave()}"
              radio
              :checked="item.vendor_product_id === product.id"
            >
              <tommy-circle-avatar :url="product.image_url" slot="media"></tommy-circle-avatar>
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
        contacts: API.contacts,
      };
    },
    mounted() {
      const self = this;
      if (!self.id) {
        self.item = {
          expire_at: '',
          description: '',
          name: '',
          amount: 0,
          user_id: null,
          vendor_product_id: null,
        };
      } else {
        API.loadPromotion(self.id).then((item) => {
          self.item = item;
        });
      }

      API.loadProducts().then((products) => {
        self.products = products;
      });
    },
    computed: {
      customerAvatar() {
        const self = this;
        if (!self.item.user_id) return null;
        let user = self.$root.teamMembers.filter(m => m.user_id === self.item.user_id)[0];
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
        let user = self.$root.teamMembers.filter(m => m.user_id === self.item.user_id)[0];
        if (!user && self.contacts) {
          // assuming contact
          user = self.contacts.filter(c => c.friend_id === self.item.user_id)[0];
        }
        if (!user) return '';
        return `${user.first_name || ''} ${user.last_name || ''}`;
      },
      itemAvatar() {
        const self = this;
        if (!self.item.vendor_product_id) return null;
        const product = self.products.filter(p => p.id === self.item.vendor_product_id)[0];
        if (!product) return null;
        return product.image_url;
      },
      itemTitle() {
        const self = this;
        if (!self.item.vendor_product_id) return self.$t('invoicing.promotion.item_placeholder');
        const product = self.products.filter(p => p.id === self.item.vendor_product_id)[0];
        if (!product) return '';
        return product.name;
      },
    },
    methods: {
      formatValueDate(date) {
        const self = this;
        if (!date) return '';
        return self.$moment(new Date(date)).format('YYYY-MM-DDTHH:mm');
      },
      onDateChange(e) {
        const self = this;
        const value = e.target.value;
        clearTimeout(self.dateChangeTimeout);
        self.item.expire_at = new Date(value).toJSON();
        self.enableSave();
      },
      setDiscount(value) {
        const self = this;
        const newPrice = value.replace(/[¥ ]*/, '').replace(/,/g, '.').trim();
        self.item.amount = newPrice;
        self.$set(self.item, 'amount', newPrice);
        self.item.amount_cents = self.item.amount * 100;
        if (Number.isNaN(self.item.amount_cents)) self.item.amount_cents = 0;
        self.enableSave();
      },
      enableSave() {
        const self = this;
        self.showSave = true;
      },
      save() {
        const self = this;
        self.showSave = false;
        API.savePromotion(self.item).then(() => {
          self.$events.$emit('invoicing:reloadPromotions');
          self.$f7router.back();
        });
      },
    },
  };
</script>

