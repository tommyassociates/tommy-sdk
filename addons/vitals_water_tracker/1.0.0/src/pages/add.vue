<template>
  <f7-page id="vitals_element__add" :class="`vitals-element-manual-add-page vitals-${vitalsElement}-manual-add-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
    </f7-navbar>

    <f7-list no-chevron no-hairlines no-hairlines-between>
      <f7-list-item
        link
        :title="`${t('option_a_label')}${t('vital_unit.5')}`"
        @click="addValue(150)"
      >
        <img :src="`${$addonAssetsUrl}card-icon-cup.svg`" slot="media">
      </f7-list-item>
      <f7-list-item
        link
        :title="`${t('option_b_label')}${t('vital_unit.5')}`"
        @click="addValue(220)"
      >
        <img :src="`${$addonAssetsUrl}card-icon-glass.svg`" slot="media">
      </f7-list-item>
      <f7-list-item
        link
        :title="`${t('option_c_label')}${t('vital_unit.5')}`"
        @click="addValue(350)"
      >
        <img :src="`${$addonAssetsUrl}card-icon-bottle.svg`" slot="media">
      </f7-list-item>
      <f7-list-item
        link
        :title="`${t('option_d_label')}${t('vital_unit.5')}`"
        @click="addValue(400)"
      >
        <img :src="`${$addonAssetsUrl}card-icon-bottle.svg`" slot="media">
      </f7-list-item>
      <f7-list-item
        link
        :title="`${t('custom_button')}`"
        :class="`vitals-${vitalsElement}-manual-add-custom-button`"
        @click="addCustom"
      ></f7-list-item>

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
      const self = this;
      return {};
    },
    computed: {
      allowSave() {
        const self = this;
        return self.value && self.value > 0;
      },
    },
    mounted() {
      const self = this;
      /*
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
        on: {
          change(p, v) {
            self.time = v.join(':');
          },
        },
      });
      */
    },
    methods: {
      t(v, d) {
        return this.$t(`${this.addon}.manual_enter.${v}`, d);
      },
      addCustom() {
        const self = this;
        self.$f7.dialog.create({
          text: self.$t('vitals_water_tracker.custom_amount.text'),
          content: '<div class="dialog-input-field item-input"><div class="item-input-wrap"><input type="number" class="dialog-input"></div></div>',
          buttons: [
            {
              text: self.$t('vitals_water_tracker.custom_amount.cancel_button'),
              keyCodes: [27],
            },
            {
              text: self.$t('vitals_water_tracker.custom_amount.confirm_button'),
              bold: true,
              color: 'red',
              keyCodes: [13],
            },
          ],
          onClick(dialog, index) {
            const inputValue = dialog.$el.find('.dialog-input').val();
            if (index !== 1 || !inputValue) return;
            self.addValue(parseFloat(inputValue));
          },
          destroyOnClose: true,
        }).open();
      },
      addValue(value) {
        const self = this;

        const date = new Date();
        let hours = new Date().getHours();
        if (hours < 10) hours = `0${hours}`;
        let minutes = new Date().getMinutes();
        if (minutes < 10) minutes = `0${minutes}`;
        const time = `${hours}:${minutes}`;
        date.setHours(0, 0, 0, 0);

        API.addRecord(
          self.addon,
          self.vitalsElement,
          self.$root.user,
          {
            value,
            date: new Date(date).toJSON(),
            time,
            unit: 5,
          }
        ).then(() => {
          self.$events.$emit(`${self.addon}:updateRecords`);
          self.$f7router.back();
        });
      },
    },
  };
</script>

