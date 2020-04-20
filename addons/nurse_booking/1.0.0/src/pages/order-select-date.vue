<template>
  <f7-page name="nurse_booking__date-time" id="nurse_booking__date-time">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t(`nurse_booking.date_time.title`)}}</f7-nav-title>
    </f7-navbar>

    <a
      slot="fixed"
      class="nurse_booking__toolbar-button"
      :class="{disabled: !selectedDate || !selectedHours}"
      href="#"
      @click="selectDateTime"
    >{{$t('nurse_booking.date_time.determine_button')}}</a>

    <div class="date-time-dates">
      <label
        v-for="(date, index) in dates"
        :key="index"
        class="date-time-date"
        :class="{'date-time-date-disabled': date.disabled}"
      >
        <input type="radio" :checked="selectedDate === date.value" :disabled="date.disabled" @change="selectedDate = date.value">
        <div class="date-time-date-num">{{date.day}}.{{date.month}}</div>
        <div class="date-time-date-day" v-if="date.today">Today</div>
        <div class="date-time-date-day" v-else>{{date.weekDay}}</div>
      </label>
    </div>

    <div class="date-time-hours">
      <label v-for="(hour, index) in hours" :key="index" class="date-time-hour" :class="{disabled: hour.disabled}">
        <input type="radio" :checked="selectedHours === hour.value" :disabled="hour.disabled" @change="selectedHours = hour.value">
        <span>{{hour.hour}}</span>
      </label>
    </div>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      const self = this;
      const nowDate = new Date();
      const nowTime = nowDate.getTime();
      const dates = [];

      let todayDisabled;
      for (let i = 0; i <= 13; i += 1) {
        const date = new Date(nowTime + i * 24 * 60 * 60 * 1000);
        let month = date.getMonth() + 1;
        let day = date.getDate();
        if (day < 10) day = `0${day}`;
        if (month < 10) month = `0${month}`;
        const weekDay = date.getDay();
        const isToday = i === 0;
        const disabled = isToday ? nowDate.getHours() >= 19 : false;
        if (disabled) {
          todayDisabled = true;
        }
        dates.push({
          disabled,
          value: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
          day,
          month,
          weekDay: self.$t(`nurse_booking.date_time.week_days.${weekDay}`),
        });
      }

      const overrideDate = self.$f7route.query.date && new Date(parseInt(self.$f7route.query.date, 10));
      let overrideSelectedDate;
      let overrideSelectedHours;
      if (overrideDate) {
        overrideSelectedDate = new Date(overrideDate.getFullYear(), overrideDate.getMonth(), overrideDate.getDate()).getTime();
        overrideSelectedHours = overrideDate.getHours();
      }

      return {
        dates,
        selectedDate: overrideSelectedDate || (todayDisabled ? dates[1].value : dates[0].value),
        selectedHours: overrideSelectedHours || null,
      };
    },
    watch: {
      selectedDate() {
        this.selectedHours = null;
      },
    },
    computed: {
      hours() {
        const self = this;
        const date = new Date(self.selectedDate);
        const hours = [];
        const today = new Date();
        let isToday;
        if (today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate()) {
          isToday = true;
        }
        for (let i = 10; i <= 19; i += 1) {
          const disabled = isToday ? today.getHours() >= i : false;
          hours.push({
            value: i,
            disabled,
            hour: `${i}:00`,
          });
        }
        return hours;
      },
    },
    methods: {
      selectDateTime() {
        const self = this;
        const date = self.selectedDate;
        const hours = self.selectedHours;

        API.cache.booking.date = new Date(parseInt(date, 10)).getTime() + hours * 60 * 60 * 1000;
        console.log('booking.date, @@@@@@@@@@@@@@@@@@@@@', self.selectedDate, self.selectedHours, API.cache.booking.date)
        
        if (self.$f7route.query.back) {
          self.$f7router.back();
        } else {
          self.$f7router.navigate('/nurse_booking/order-select-nurse/');
        }
      },
    },
  };
</script>
