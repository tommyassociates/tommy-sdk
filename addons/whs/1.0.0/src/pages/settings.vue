<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.settings.title')}}</f7-nav-title>
    </f7-navbar>

    <f7-list class="no-margin no-hairlines whs-settings-list">
      <f7-list-input
        type="text"
        :label="$t('whs.general.name_label')"
        inline-label
        value="Inventory"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.currency')"
        after="$"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.date')"
        after="2019-03-16"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.time')"
        after="5:58 PM"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.export')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.import')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.permissions')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.customers')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.integrations')"
      />
      <f7-list-item
        divider
        :title="$t('whs.settings.preferences_title')"
      />
      <f7-list-item
        link="/whs/settings/items/"
        :title="$t('whs.settings.items')"
      />
      <f7-list-item
        link="/whs/settings/tags/"
        :title="$t('whs.settings.tags')"
      />
      <f7-list-item
        link="/whs/settings/locations/"
        :title="$t('whs.settings.locations')"
      />
      <f7-list-item
        link="/whs/settings/activities/"
        :title="$t('whs.settings.activities')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.activity_dashboard')"
      />
    </f7-list>
    <f7-list class="no-hairlines whs-settings-list">
      <f7-list-item
        link
        :title="$t('whs.settings.subscriptions')"
      />
    </f7-list>
  </f7-page>
</template>
<script>
import API from "../api";

export default {
  components: {
  },
  data() {
    return {
    };
  },
  created() {

  },
  computed: {

  },
  methods: {

  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  }
};
</script>
