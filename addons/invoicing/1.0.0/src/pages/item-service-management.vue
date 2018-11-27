<template>
  <f7-page name="invoicing__item-service-management" id="invoicing__item-service-management" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.item_service_management.title', 'Items / Service')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link @click="addItem" icon-f7="add"></f7-link>
      </f7-nav-right>
    </f7-navbar>
    <div class="item-service-tabs-links">
      <f7-link @click="activeTab = 'items'" :class="{active: activeTab === 'items'}">{{$t('invoicing.item_service_management.items_tab')}}</f7-link>
      <f7-link @click="activeTab = 'packages'" :class="{active: activeTab === 'packages'}">{{$t('invoicing.item_service_management.packages_tab')}}</f7-link>
    </div>
    <div class="item-service-tab" v-show="activeTab === 'items'">
      <f7-searchbar search-container=".invoicing-list-items" :backdrop="false" v-if="items && items.length" :disable-button="false" :placeholder="$t('invoicing.item_service_management.search_items')"></f7-searchbar>
      <f7-list class="list-custom invoicing-list-items" no-hairlines v-if="items && items.length">
        <f7-list-item
          v-for="item in orderedProducts"
          :key="item.id"
          :title="item.name"
          :link="`/invoicing/product-details/${item.id}/?title=${item.name || ''}`"
        ></f7-list-item>
      </f7-list>
    </div>
    <div class="item-service-tab" v-show="activeTab === 'packages'">
      <f7-searchbar search-container=".invoicing-list-packages" :backdrop="false" v-if="packages && packages.length" :disable-button="false" :placeholder="$t('invoicing.item_service_management.search_packages')"></f7-searchbar>
      <f7-list class="list-custom invoicing-list-packages" no-hairlines v-if="packages && packages.length">
        <f7-list-item
          v-for="item in orderedPackages"
          :key="item.id"
          :title="item.name"
          :link="`/invoicing/package-details/${item.id}/?title=${item.name || ''}`"
        ></f7-list-item>
      </f7-list>
    </div>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        items: null,
        packages: null,
        activeTab: 'items',
      };
    },
    mounted() {
      const self = this;
      self.loadProducts();
      self.loadPackages();
      self.$events.$on('invoicing:reloadProducts', self.loadProducts);
      self.$events.$on('invoicing:reloadPackages', self.loadPackages);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off('invoicing:reloadProducts', self.loadProducts);
      self.$events.$off('invoicing:reloadPackages', self.loadPackages);
    },
    computed: {
      orderedProducts() {
        const self = this;
        if (!self.items) return [];
        return self.items.sort((a, b) => a.id - b.id);
      },
      orderedPackages() {
        const self = this;
        if (!self.packages) return [];
        return self.packages.sort((a, b) => a.id - b.id);
      },
    },
    methods: {
      addItem() {
        const self = this;
        if (self.activeTab === 'items') {
          self.$f7router.navigate('/invoicing/product-details/');
        } else {
          self.$f7router.navigate('/invoicing/package-details/');
        }
      },
      loadPackages() {
        const self = this;
        API.loadPackages({}, { cache: false }).then((packages) => {
          self.packages = packages;
        });
      },
      loadProducts() {
        const self = this;
        API.loadProducts({}, { cache: false }).then((items) => {
          self.items = items;
        });
      },
      add() {},
    },
  };
</script>