<template>
  <f7-page class="invoicing-page" name="invoicing__date-range-select" id="invoicing__date-range-select">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.common.date_range', 'Date Range')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list>
      <f7-list-item
        radio
        value=""
        :checked="!isCustomRange && (range === '' || !range)"
        @change="setPlainRange('')"
        :title="$t('invoicing.date_range.none', 'None')"
      ></f7-list-item>
      <f7-list-item
        radio
        value="today"
        :checked="!isCustomRange && range === 'today'"
        @change="setPlainRange('today')"
        :title="$t('invoicing.date_range.today', 'Today')"
      ></f7-list-item>
      <f7-list-item
        radio
        value="week"
        :checked="!isCustomRange && range === 'week'"
        @change="setPlainRange('week')"
        :title="$t('invoicing.date_range.week', 'This Week')"
      ></f7-list-item>
      <f7-list-item
        radio
        value="month"
        :checked="!isCustomRange && range === 'month'"
        @change="setPlainRange('month')"
        :title="$t('invoicing.date_range.month', 'This Month')"
      ></f7-list-item>
    </f7-list>

    <f7-list class="top-10 list-custom">
      <f7-list-item
        :title="$t('invoicing.common.choose_range', 'Choose Range')"
      >
        <f7-toggle slot="after" :checked="isCustomRange" @change="toggleCustomRange($event.target.checked)"></f7-toggle>
      </f7-list-item>

      <f7-list-item v-show="isCustomRange">
        <f7-label>{{$t('invoicing.common.start_date', 'Start Date')}}</f7-label>
        <f7-input type="text" ref="rangeStart"></f7-input>
      </f7-list-item>
      <f7-list-item v-show="isCustomRange">
        <f7-label>{{$t('invoicing.common.end_date', 'End Date')}}</f7-label>
        <f7-input type="text" ref="rangeEnd"></f7-input>
      </f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      list: Object,
    },
    data() {
      const self = this;
      const { list } = self;
      const range = list.data.date_range;
      return {
        showSave: false,
        dateFrom: Array.isArray(range) && range[0] ? range[0] : new Date().getTime(),
        dateTo: Array.isArray(range) && range[1] ? range[1] : new Date().getTime(),
        range,
      };
    },
    computed: {
      isCustomRange() {
        const range = this.range;
        return Array.isArray(range) || !(!range || typeof range === 'string');
      },
    },
    mounted() {
      const self = this;
      let fromInitialChange = false;
      let toInitialChange = false;
      self.calendarFrom = self.$f7.calendar.create({
        inputEl: self.$$(self.$refs.rangeStart.$el).find('input'),
        closeOnSelect: true,
        value: [self.dateFrom],
        on: {
          change(calendar, values) {
            if (fromInitialChange) {
              self.showSave = true;
            }
            fromInitialChange = true;
            self.dateFrom = new Date(values[0]).getTime();
            if (Array.isArray(self.range) && self.range[0]) self.range[0] = self.dateFrom;
            if (self.dateFrom > self.dateTo) {
              self.calendarTo.setValue([self.dateFrom]);
            }
          },
        },
      });
      self.calendarTo = self.$f7.calendar.create({
        inputEl: self.$$(self.$refs.rangeEnd.$el).find('input'),
        closeOnSelect: true,
        value: [self.dateTo],
        on: {
          change(calendar, values) {
            if (toInitialChange) {
              self.showSave = true;
            }
            toInitialChange = true;
            self.dateTo = new Date(values[0]).getTime();
            if (Array.isArray(self.range) && self.range[1]) self.range[1] = self.dateTo;
            if (self.dateTo < self.dateFrom) {
              self.calendarFrom.setValue([self.dateTo]);
            }
          },
        },
      });
    },
    methods: {
      setPlainRange(range) {
        const self = this;
        self.range = range;
        self.showSave = true;
      },
      toggleCustomRange(isCustom) {
        const self = this;
        self.showSave = true;
        if (isCustom) {
          self.range = [self.dateFrom, self.dateTo];
        } else {
          self.range = '';
        }
      },
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        self.showSave = false;
        const newList = Object.assign({}, self.list);
        newList.data.date_range = self.range;
        API.saveList(newList).then(() => {
          self.$events.$emit('invoicing:setListDateRange', self.list.id, self.range);
          self.$f7router.back();
        });
      },
    },
  };
</script>

