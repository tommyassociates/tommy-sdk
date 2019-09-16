<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.settings_items.title')}}</f7-nav-title>
    </f7-navbar>

    <f7-list class="no-margin no-hairlines whs-settings-list">
      <ul>
        <f7-list-input
          type="text"
          :label="$t('whs.common.name_label')"
          inline-label
          value="Items"
        />
        <list-color-picker
          :title="$t('whs.settings_items.header_bg_color')"
          :value="headerBgColor"
          @change="(v) => headerBgColor = v"
        />
        <list-color-picker
          :title="$t('whs.settings_items.header_font_color')"
          :value="headerFontColor"
          @change="(v) => headerFontColor = v"
        />
        <list-color-picker
          :title="$t('whs.settings_items.standard_font_color')"
          :value="standardFontColor"
          @change="(v) => standardFontColor = v"
        />
        <f7-list-item
          :title="$t('whs.settings_items.fields')"
          link="/whs/settings/items/fields/"
        />
        <f7-list-item
          :title="$t('whs.settings.view_settings')"
          divider
        />
        <f7-list-item
          :title="$t('whs.settings.view_settings_main_menu')"
          link
        />
        <f7-list-item
          :title="$t('whs.settings.view_settings_summary')"
          link
        />
        <f7-list-item
          :title="$t('whs.settings.view_settings_locations')"
          link
        />
        <f7-list-item
          :title="$t('whs.settings.view_settings_tags')"
          link
        />
        <f7-list-item
          :title="$t('whs.settings.view_settings_activities')"
          link
        />
      </ul>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from "../api";
  import ListColorPicker from '../components/list-color-picker.vue';

  export default {
    components: {
      ListColorPicker,
    },
    data() {
      return {
        headerBgColor: '#fff',
        headerFontColor: '#ff4500',
        standardFontColor: '#333',
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
