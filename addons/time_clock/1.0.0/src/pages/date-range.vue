<template>
  <f7-page class="time-clock-range-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_clock.date_range.title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-only @click="saveRange" class="back">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-list media-list>
      <f7-list-item
        radio
        name="range"
        :title="$t('time_clock.date_range.notset_label')"
        @change="rangeChange('notset')"
        :checked="date_range === 'notset'"
      >

      </f7-list-item>

      <f7-list>
        <date-range-select></date-range-select>

        <!--
        <f7-list-item
          :title="$t('time_clock.date_range.start_custom_label')"
          @click="openCalendarBegin()"
          :after="dateBeginField"
        ></f7-list-item>
        <f7-list-item
          :title="$t('time_clock.date_range.end_custom_label')"
          @click="openCalendarEnd()"
          :after="dateEndField"
        ></f7-list-item>
        -->
      </f7-list>
    </f7-list>
  </f7-page>
</template>

<script>

import dateRangeSelect from 'tommy_core/src/components/date-range-select.vue';

export default {
  name: "DateRange",
  props: {
    date_range: String,
    date_range_custom: {
        type: Object,
        default:{
            begin: null,
            end: null,
        }
    },
    editRange: Function
  },
  components: {
    dateRangeSelect
  },
  methods: {
    openCalendarBegin(){
        const self = this;
        self.calendarBeginInstance.open();
    },
    openCalendarEnd(){
        const self = this;
        self.calendarEndInstance.open();
    },
    saveRange() {
      const self = this;
      self.editRange(self.new_date_range, self.new_date_range_custom);
    },
    rangeChange(val) {
      const self = this;
      self.new_date_range = val;
    },
    createCalendarBegin() {
      const self = this;
      let date;
      if (self.new_date_range_custom.begin === null){
          date = new Date();
      }else{
          date = new Date(self.new_date_range_custom.begin);
      }
      self.calendarBeginInstance = self.$f7.calendar.create({
        value: [date],
        openIn: "customModal",
        backdrop: true,
        closeOnSelect: true,
        on: {
          change(cal, val) {
            self.new_date_range_custom.begin = val[0];
          }
        }
      });
    },
    createCalendarEnd() {
      const self = this;
      let date;

      if (self.new_date_range_custom.end === null){
          date = new Date();
      }else{
          date = new Date(self.new_date_range_custom.end);
      }
      self.calendarEndInstance = self.$f7.calendar.create({
        value: [date],
        openIn: "customModal",
        backdrop: true,
        closeOnSelect: true,
        on: {
          change(cal, val) {
            self.new_date_range_custom.end = val[0];
          }
        }
      });
    }
  },
  mounted() {
    const self = this;
    self.createCalendarBegin();
    self.createCalendarEnd();
  },
  beforeDestroy() {
    const self = this;
    self.calendarBeginInstance.destroy();
    self.calendarEndInstance.destroy();
  },
  computed: {
    dateBeginField() {
      const self = this;
      if (!self.new_date_range_custom) return null;
      return self
        .$moment(new Date(self.new_date_range_custom.begin))
        .format("DD MMM YYYY");
    },
    dateEndField() {
      const self = this;
      if (!self.new_date_range_custom) return null;
      return self
        .$moment(new Date(self.new_date_range_custom.end))
        .format("DD MMM YYYY");
    }
  },
  data() {
    const self = this;
    return {
      new_date_range: self.date_range,
      new_date_range_custom: self.date_range_custom
    };
  }
};
</script>
