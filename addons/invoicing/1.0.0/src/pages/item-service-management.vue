<template>
  <f7-page name="invoicing__item-service-management" id="invoicing__item-service-management" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.item_service_management.title', 'Items / Service')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link popover-open=".add-item-service-package-popover" icon-f7="add"></f7-link>
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
          v-for="item in items"
          :key="item.id"
          :title="item.name"
          :link="`/invoicing/item-details/${item.id}/?title=${item.name}`"
        ></f7-list-item>
      </f7-list>
    </div>
    <div class="item-service-tab" v-show="activeTab === 'packages'">
      <f7-searchbar search-container=".invoicing-list-packages" :backdrop="false" v-if="packages && packages.length" :disable-button="false" :placeholder="$t('invoicing.item_service_management.search_packages')"></f7-searchbar>
      <f7-list class="list-custom invoicing-list-packages" no-hairlines v-if="packages && packages.length">
        <f7-list-item
          v-for="item in packages"
          :key="item.id"
          :title="item.name"
          :link="`/invoicing/package-details/${item.id}/?title=${item.name}`"
        ></f7-list-item>
      </f7-list>
    </div>
    <f7-popover class="add-item-service-package-popover">
      <f7-list>
        <f7-list-button popover-close link="/invoicing/item-details/">{{$t('invoicing.item_service_management.new_item')}}</f7-list-button>
        <f7-list-button popover-close link="/invoicing/package-details/">{{$t('invoicing.item_service_management.new_package')}}</f7-list-button>
      </f7-list>
    </f7-popover>
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
      API.loadItems({}, { cache: false }).then((items) => {
        self.items = items;
        self.items = [
          {
            id: 1,
            name: 'Item 1',
          },
          {
            id: 2,
            name: 'Item 2',
          },
        ]
      });
      API.loadPackages({}, { cache: false }).then((packages) => {
        self.packages = packages;
        self.packages = [
          {
            id: 1,
            name: 'Package 1',
          },
          {
            id: 2,
            name: 'Package 2',
          },
        ]
      });
    },
    computed: {

    },
    methods: {
      add() {},
    },
  };
</script>