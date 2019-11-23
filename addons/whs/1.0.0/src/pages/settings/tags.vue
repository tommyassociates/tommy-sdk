<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.settings_edit.title_tag')}}</f7-nav-title>
      <f7-nav-right v-if="edited">
        <f7-link @click="updateSettings()">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="no-margin no-hairlines whs-settings-list">
      <ul>
        <f7-list-input
          type="text"
          :label="$t('whs.settings_edit.name_label')"
          inline-label
          :value="settings.name"
          @input="updateValue('name', $event.target.value)"
        />
        <f7-list-input
          type="text"
          :label="$t('whs.settings_edit.plural_name_label')"
          inline-label
          :value="settings.plural_name"
          @input="updateValue('plural_name', $event.target.value)"
        />

        <list-color-picker
          :title="$t('whs.settings_edit.header_bg_color')"
          :value="settings.header_color"
          @change="(v) => updateValue('header_color', v)"
        />
        <list-color-picker
          :title="$t('whs.settings_edit.header_font_color')"
          :value="settings.highlight_color"
          @change="(v) => updateValue('highlight_color', v)"
        />
        <list-color-picker
          :title="$t('whs.settings_edit.standard_font_color')"
          :value="settings.font_color"
          @change="(v) => updateValue('font_color', v)"
        />
        <f7-list-item :title="$t('whs.settings_edit.fields')" link />
        <f7-list-item :title="$t('whs.settings.view_settings')" divider />
        <f7-list-item :title="$t('whs.settings.view_settings_main_menu')" link />
        <f7-list-item :title="$t('whs.settings.view_settings_summary')" link />
        <f7-list-item :title="$t('whs.settings.view_settings_locations')" link />
        <f7-list-item :title="$t('whs.settings.view_settings_tags')" link />
        <f7-list-item :title="$t('whs.settings.view_settings_activities')" link />
      </ul>
    </f7-list>
  </f7-page>
</template>
<script>
import API from "../../api";
import ListColorPicker from "../../components/list-color-picker.vue";

export default {
  components: {
    ListColorPicker
  },
  data() {
    return {
      edited: false,
      settings: Object.assign({}, API.main_page.$data.settings.tag)
    };
  },
  created() {},
  computed: {},
  methods: {
    updateValue(target, val) {
      self = this;
      self.editParam = null;
      self.edited = true;
      self.settings[target] = val;
    },
    updateSettings() {
      self = this;
      self.edited = false;
      API.main_page.$data.settings.item = self.settings;
      API.saveSettings("tag", self.settings).then(() => {
        API.toast(
          self.$t("whs.toast.settings", { text: this.settings.plural_name })
        );
      });
    }
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  }
};
</script>
