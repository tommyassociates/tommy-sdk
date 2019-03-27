<template>
  <f7-page id="vitals_element__settings" :class="`vitals-element-settings-page vitals-${vitalsElement}-settings-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
    </f7-navbar>

    <div :class="`vitals-element-settings-header vitals-${vitalsElement}-settings-header`">
      <div :class="`vitals-element-settings-icon vitals-${vitalsElement}-settings-icon`"></div>
      <div :class="`vitals-element-settings-center-icon vitals-${vitalsElement}-settings-center-icon`"></div>
    </div>
    <div :class="`vitals-element-settings-text vitals-${vitalsElement}-settings-text`">
      <p>{{t('vital_text')}}</p>
    </div>

    <f7-list class="no-hairlines">
      <f7-list-item
        :title="t('chat_label')"
      >
        <f7-toggle slot="after" :checked="settings.receiveMessage" @toggle:change="onMessagesChanges" />
      </f7-list-item>
      <f7-list-item
        link="/vitals_immunisations/archive/"
        :title="t('archive_label')"
      />
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  let settings = {
    receiveMessage: false,
  };

  export default {
    props: {
      addon: String,
      vitalsElement: String,
    },
    data() {
      return {
        settings,
      };
    },
    mounted() {
      const self = this;
      API.getSettings(self.addon).then((res) => {
        if (!res) return;
        self.settings = res;
        settings = self.settings;
      });
    },
    methods: {
      t(v, d) {
        return this.$t(`${this.addon}.settings.${v}`, d);
      },
      onMessagesChanges(checked) {
        const self = this;
        self.settings.receiveMessage = checked;
        settings = self.settings;
        API.saveSettings(self.addon, self.settings);
      },
    },
  };
</script>

