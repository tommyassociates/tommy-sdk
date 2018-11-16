<template>
  <f7-page name="invoicing__promotion-management" id="invoicing__promotion-management" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.promotion_management.title', 'Promotions')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="/invoicing/promotion-details/" icon-f7="add"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="list-custom invoicing-list-items" no-hairlines v-if="items && items.length">
      <f7-list-item
        v-for="item in orderedPromotions"
        :key="item.id"
        :title="item.name"
        :link="`/invoicing/promotion-details/${item.id}/?title=${item.name || ''}`"
      ></f7-list-item>
    </f7-list>

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
      self.loadPromotions();
      self.$events.$on('invoicing:reloadPromotions', self.loadPromotions);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off('invoicing:reloadPromotions', self.loadPromotions);
    },
    computed: {
      orderedPromotions() {
        const self = this;
        if (!self.items) return [];
        return self.items.sort((a, b) => a.id - b.id);
      },
    },
    methods: {
      loadPromotions() {
        const self = this;
        API.loadPromotions({}, { cache: false }).then((items) => {
          self.items = items;
        });
      },
    },
  };
</script>