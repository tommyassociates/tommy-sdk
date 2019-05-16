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
    <div class="medication-toolbar" v-if="loaded" slot="fixed">
      <a href="#" @click="deleteMedication">{{t('delete_button')}}</a>
      <a href="#" @click="() => reminder ? stopReminder() : startReminder()">{{t(reminder ? 'pause_button' : 'start_button')}}</a>
    </div>

    <f7-list v-if="loaded" no-hairlines>
      <f7-list-input
        type="text"
        inline-label
        :value="name"
        @input="name = $event.target.value"
        :label="t('vital_label')"
      ></f7-list-input>
      <f7-list-input
        type="text"
        inline-label
        input-id="date-input-start"
        :label="t('startdate_label')"
      />
      <f7-list-input
        type="text"
        inline-label
        input-id="date-input-end"
        :label="t('enddate_label')"
      />
      <f7-list-item
        smart-select
        :smart-select-params="{ openIn: 'popover', closeOnSelect: true }"
        :title="t('frequency_label')"
        :after="t(`frequency_units.0`)"
      >
        <select :value="frequency" @change="frequency = parseInt($event.target.value, 10)">
          <option
            v-for="n in 8"
            :value="n"
            :key="n"
          >{{t(`frequency_units.${n - 1}`)}}</option>
        </select>
      </f7-list-item>

      <f7-list-item
        v-for="n in frequency"
        :key="n"
        class="vitals-medication_reminder-dosage-input"
      >
        <div class="input">
          <input type="text" class="time-input" :value="dosage[n - 1].time">
        </div>
        <div class="input" style="width: 100px">
          <input type="number" :placeholder="t('dosage_label')" :value="dosage[n - 1].value" @input="dosage[n - 1].value = $event.target.value">
        </div>
        <div class="input input-dropdown">
          <select :value="dosage[n - 1].unit || 'bag'" @change="dosage[n - 1].unit = $event.target.value">
            <option value="bag">{{t('dosage_unit.bag')}}</option>
            <option value="ml">{{t('dosage_unit.ml')}}</option>
            <option value="pill">{{t('dosage_unit.pill')}}</option>
            <option value="mg">{{t('dosage_unit.mg')}}</option>
            <option value="drop">{{t('dosage_unit.drop')}}</option>
          </select>
        </div>
      </f7-list-item>

    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      id: String,
      vitalsElement: String,
    },
    data() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        loaded: false,
        name: '',
        frequency: 1,
        startDate: today,
        endDate: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000),
        reminder: true,
        dosage: [{
          value: '',
          unit: 'bag',
          time: '10:00',
        }],
      };
    },
    computed: {
      allowSave() {
        const self = this;
        if (self.name && self.name.trim().length) {
          let allow = true;
          self.dosage.forEach((d) => {
            if (!d.value || d.value < 1) allow = false;
          });
          if (allow) return true;
        }
        return false;
      },
    },
    watch: {
      frequency() {
        const self = this;
        const lastValue = self.dosage[self.dosage.length - 1].value;
        const lastUnit = self.dosage[self.dosage.length - 1].unit;
        const lastTime = self.dosage[self.dosage.length - 1].time;
        for (let i = 0; i < self.frequency; i += 1) {
          if (!self.dosage[i]) {
            self.dosage[i] = {
              value: lastValue,
              unit: lastUnit,
              time: lastTime,
            };
          }
        }
        self.$nextTick(() => {
          self.createPickers();
        });
      },
    },
    mounted() {
      const self = this;
      let end;
      API.getMedication(self.$root.user, self.id).then((med) => {
        self.name = med.data.name;
        self.frequency = med.data.frequency;
        self.startDate = med.data.startDate;
        self.endDate = med.data.endDate;
        self.dosage = med.data.dosage;
        self.reminder = med.data.reminder;
        self.loaded = true;
        self.$nextTick(() => {
          self.$f7.calendar.create({
            inputEl: self.$el.querySelector('#date-input-start'),
            value: [self.startDate],
            minDate: new Date(),
            on: {
              change(c, v) {
                self.startDate = new Date(v[0]);
                self.startDate.setHours(0, 0, 0, 0);
                if (end) {
                  end.params.minDate = self.startDate;
                  const endv = new Date(end.value[0]).getTime();
                  const startv = new Date(self.startDate).getTime();
                  if (endv < startv) end.setValue([self.startDate]);
                }
              },
            },
          });
          end = self.$f7.calendar.create({
            inputEl: self.$el.querySelector('#date-input-end'),
            value: [self.endDate],
            on: {
              change(c, v) {
                self.endDate = new Date(v[0]);
                self.endDate.setHours(0, 0, 0, 0);
              },
            },
          });
          self.createPickers();
        });
      });
    },
    methods: {
      t(v, d) {
        return this.$t(`health_vitals.${this.vitalsElement}.medication_edit.${v}`, d);
      },
      createPickers() {
        const self = this;
        self.$$(self.$el).find('.vitals-medication_reminder-dosage-input .time-input').each((index, el) => {
          if (el.f7PickerCreated) return;
          el.f7PickerCreated = true;

          self.$f7.picker.create({
            inputEl: el,
            value: [self.dosage[index].time.split(':')[0], self.dosage[index].time.split(':')[1]],
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
                self.dosage[index].time = v.join(':');
              },
            },
          });
        });
      },
      deleteMedication() {
        const self = this;
        API.deleteMedication(self.$root.user, self.id).then(() => {
          self.$events.$emit(`${self.vitalsElement}:updateRecords`);
          self.$f7router.back();
        });
      },
      stopReminder() {
        const self = this;
        const { name, startDate, endDate, dosage, frequency } = self;
        API.updateMedication(
          self.$root.user,
          self.id,
          {
            name,
            startDate: new Date(startDate).toJSON(),
            endDate: new Date(endDate).toJSON(),
            dosage,
            frequency,
            reminder: false,
          }
        ).then(() => {
          self.$events.$emit(`${self.vitalsElement}:updateRecords`);
          self.$f7router.back();
        });
      },
      startReminder() {
        const self = this;
        const { name, startDate, endDate, dosage, frequency } = self;
        API.updateMedication(
          self.$root.user,
          self.id,
          {
            name,
            startDate: new Date(startDate).toJSON(),
            endDate: new Date(endDate).toJSON(),
            dosage,
            frequency,
            reminder: true,
          }
        ).then(() => {
          self.$events.$emit(`${self.vitalsElement}:updateRecords`);
          self.$f7router.back();
        });
      },
      save() {
        const self = this;
        const { name, startDate, endDate, dosage, frequency } = self;
        let reminder = self.reminder;
        if (typeof reminder === 'undefined') reminder = true;
        API.updateMedication(
          self.$root.user,
          self.id,
          {
            name,
            startDate: new Date(startDate).toJSON(),
            endDate: new Date(endDate).toJSON(),
            dosage,
            frequency,
            reminder,
          }
        ).then(() => {
          self.$events.$emit(`${self.vitalsElement}:updateRecords`);
          self.$f7router.back();
        });
      },
    },
  };
</script>

