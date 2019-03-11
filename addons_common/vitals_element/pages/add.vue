<template>
  <f7-page id="vitals_element__add" :class="`vitals-element-manual-add-page vitals-${vitalsElement}-manual-add-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="#" icon-only v-if="allowSave" @click="save">
          <i class="icon f7-icons">check</i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list>
      <f7-list-input
        type="number"
        inline-label
        :value="value"
        @input="value = $event.target.value"
        min="1"
        :label="t('vital_label')"
      >
        <span slot="inner" class="vitals-element-input-unit">{{t('vital_unit.0')}}</span>
      </f7-list-input>
      <f7-list-input
        type="text"
        inline-label
        input-id="date-input"
        :label="t('date_label')"
      />
      <f7-list-input
        type="text"
        inline-label
        input-id="time-input"
        :label="t('time_label')"
      />
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      addon: String,
      vitalsElement: String,
    },
    data() {
      return {
        value: '',
        date: '',
        time: '',
      };
    },
    computed: {
      allowSave() {
        const self = this;
        return self.value && self.value > 0
      },
    },
    mounted() {
      const self = this;
      self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input'),
        value: [new Date()],
        on: {
          change(c, v) {
            self.date = new Date(v[0]);
            self.date.setHours(0, 0, 0, 0);
          },
        },
      });

      let hours = new Date().getHours();
      if (hours < 10) hours = `0${hours}`;
      let minutes = new Date().getMinutes();
      if (minutes < 10) minutes = `0${minutes}`;

      self.$f7.picker.create({
        inputEl: self.$el.querySelector('#time-input'),
        value: [hours.toString(), minutes.toString()],
        formatValue(v) {
          return `${v[0]}:${v[1]}`;
        },
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
        on: {
          change(p, v) {
            self.time = v.join(':');
          },
        },
      });
    },
    methods: {
      t(v, d) {
        return this.$t(`${this.addon}.manual_enter.${v}`, d);
      },
      save() {
        const self = this;
        const { value, date, time } = self;
        API.addRecord(
          self.addon,
          self.vitalsElement,
          {
            value,
            date: new Date(date).toJSON(),
            time,
            user: self.$root.user,
            unit: 0,
          }
        ).then(() => {
          self.$events.$emit(`${self.addon}:updateRecords`);
          self.$f7router.back();
        });
      },
    },
  };
</script>

