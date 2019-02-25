<template>
  <f7-page id="weight__settings" class="weight-settings-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('weight.settings.title')}}</f7-nav-title>
    </f7-navbar>

    <div class="weight-settings-header">
      <div class="weight-settings-icon"></div>
      <div class="weight-settings-center-icon"></div>
    </div>
    <div class="weight-settings-text">
      <p>{{$t('weight.settings.vital_text')}}</p>
    </div>

    <f7-list class="no-hairlines">
      <f7-list-item
        :title="$t('weight.settings.chat_label')"
      >
        <f7-toggle slot="after" :checked="settings.receiveMessage" @toggle:change="onMessagesChanges" />
      </f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  let settings = {
    receiveMessage: false,
  };

  export default {
    data() {
      return {
        settings,
      };
    },
    mounted() {
      const self = this;
      API.getSettings().then((res) => {
        if (!res) return;
        self.settings = res;
        settings = self.settings;
      });
    },
    methods: {
      onMessagesChanges(checked) {
        const self = this;
        self.settings.receiveMessage = checked;
        settings = self.settings;
        API.saveSettings(self.settings);
      },
    },
  };
</script>

