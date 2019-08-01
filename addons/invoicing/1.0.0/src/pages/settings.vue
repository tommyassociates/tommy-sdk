<template>
  <f7-page id="invoicing__settings" data-name="invoicing__settings" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.settings.title', 'Settings')}}</f7-nav-title>
    </f7-navbar>

    <f7-list class="list-custom">
      <f7-list-item
        link="/invoicing/list-management/"
        :title="$t('invoicing.settings.list_management',  'List Management')"
      ></f7-list-item>
      <f7-list-item
        v-if="!isNurse"
        link="/invoicing/item-service-management/"
        :title="$t('invoicing.settings.item_service_management',  'Item/Service Management')"
      ></f7-list-item>
      <f7-list-item
        v-if="!isNurse"
        link="/invoicing/promotion-management/"
        :title="$t('invoicing.settings.promotion_management',  'Promotion Management')"
      ></f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        isNurse: API.isNurse,
      };
    }
  };
</script>

