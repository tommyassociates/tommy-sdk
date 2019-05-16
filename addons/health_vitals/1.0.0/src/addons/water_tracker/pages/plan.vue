<template>
  <f7-page :class="`vitals-${vitalsElement}-plan-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="#" icon-only v-if="allowSave" @click="save">
          <i class="icon f7-icons">check</i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="no-hairlines">
      <f7-list-input
        type="number"
        inline-label
        :value="value"
        @input="updateGoalValue('value', parseFloat($event.target.value))"
        min="1"
        :label="t('vital_label')"
      >
        <span slot="inner" class="vitals-element-input-unit">{{t(`vital_unit.${unit}`)}}</span>
      </f7-list-input>
    </f7-list>

    <f7-block-title>{{t('reminder_label')}}</f7-block-title>
    <f7-list class="no-hairlines">
      <f7-list-item
        :title="t('start_label')"
        :after="start_time"
        @click="openTimePicker('start_time', t('start_label'))"
        link
      ></f7-list-item>
      <f7-list-item
        :title="t('end_label')"
        :after="end_time"
        @click="openTimePicker('end_time', t('end_label'))"
        link
      ></f7-list-item>
      <f7-list-item
        :title="t('interval_label')"
        :after="formatTimeInterval(time_interval)"
        @click="openTimePicker('time_interval', t('interval_label'))"
        link
      ></f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>

  export default {
    props: {
      vitalsElement: String,
      settings: Object,
    },
    data() {
      const settings = this.settings;
      return {
        value: settings.goal_value,
        start_time: settings.goal_start_time,
        end_time: settings.goal_end_time,
        time_interval: settings.goal_time_interval,
        unit: settings.goal_unit,
        allowSave: false,
      };
    },
    mounted() {},
    methods: {
      t(v, d) {
        return this.$t(`health_vitals.${this.vitalsElement}.drinking_plan.${v}`, d);
      },
      formatTimeInterval(v) {
        let hours = Math.floor(v / 60);
        let minutes = v - Math.floor(v / 60) * 60;
        if (hours < 10) hours = `0${hours}`;
        if (minutes < 10) minutes = `0${minutes}`;
        return `${hours}:${minutes}`;
      },
      updateGoalValue(key, value) {
        const self = this;
        self[key] = value;
        self.allowSave = true;
      },
      openTimePicker(key, label) {
        const self = this;
        let value = self[key];
        let toNumber = false;
        if (typeof value === 'number') {
          toNumber = true;
          value = self.formatTimeInterval(value);
        }
        let picker;
        self.$f7.dialog.create({
          title: label,
          text: '<div class="vitals-water_tracker-dialog-time-picker"></div>',
          buttons: [
            {
              text: self.$t('label.ok'),
              bold: true,
              color: 'red',
              onClick() {
                let finalValue = `${picker.value[0]}:${picker.value[1]}`;
                if (toNumber) {
                  finalValue = picker.value[0] * 60 + parseInt(picker.value[1], 10);
                }
                self.updateGoalValue(key, finalValue);
              },
            },
          ],
          on: {
            open() {
              picker = self.$f7.picker.create({
                toolbar: false,
                value: [value.split(':')[0], value.split(':')[1]],
                containerEl: '.vitals-water_tracker-dialog-time-picker',
                cols: [
                  {
                    values: (() => {
                      const v = [];
                      for (let i = 0; i < 24; i += 1) {
                        if (i < 10) v.push(`0${i}`);
                        else v.push(i.toString());
                      }
                      return v;
                    })(),
                  },
                  {
                    divider: true,
                    content: ':',
                  },
                  {
                    values: (() => {
                      const v = [];
                      for (let i = 0; i < 60; i += 1) {
                        if (i < 10) v.push(`0${i}`);
                        else v.push(i.toString());
                      }
                      return v;
                    })(),
                  },
                ],
              });
            },
            close() {
              picker.destroy();
            },
          },
        }).open();
      },
      save() {
        const self = this;
        self.$events.$emit(`${self.vitalsElement}:updateGoal`, {
          value: self.value,
          start_time: self.start_time,
          end_time: self.end_time,
          time_interval: self.time_interval,
          unit: self.unit,
        });
        self.$f7router.back();
      },
    },
  };
</script>

