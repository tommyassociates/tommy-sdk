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
        :title="t('plan_label')"
        link="/vitals_water_tracker/plan/"
        :after="settings.goal_value ? `${settings.goal_value}${t(`vital_unit.${settings.goal_unit}`)}`: ''"
        :route-props="{ settings }"
      ></f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  let settings = {
    receiveMessage: false,
    goal_value: 0,
    goal_start_time: '08:00',
    goal_end_time: '22:00',
    goal_time_interval: 60,
    goal_unit: 5,
  };

  export default {
    props: {
      vitalsElement: String,
    },
    data() {
      return {
        settings,
      };
    },
    mounted() {
      const self = this;
      API.getSettings(self.vitalsElement).then((res) => {
        if (!res) return;
        self.settings = res;
        settings = self.settings;
      });
      self.$events.$on(`${self.vitalsElement}:updateGoal`, self.updateGoal);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off(`${self.vitalsElement}:updateGoal`, self.updateGoal);
    },
    methods: {
      t(v, d) {
        return this.$t(`health_vitals.${this.vitalsElement}.settings.${v}`, d);
      },
      updateGoal(g) {
        const self = this;
        self.settings.goal_value = g.value;
        self.settings.goal_start_time = g.start_time;
        self.settings.goal_end_time = g.end_time;
        self.settings.goal_time_interval = g.time_interval;
        self.settings.goal_unit = g.unit;
        settings = self.settings;
        API.saveSettings(self.vitalsElement, self.settings);
      },
      onMessagesChanges(checked) {
        const self = this;
        self.settings.receiveMessage = checked;
        settings = self.settings;
        API.saveSettings(self.vitalsElement, self.settings);
      },
    },
  };
</script>

