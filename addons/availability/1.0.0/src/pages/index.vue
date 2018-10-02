<template>
  <f7-page id="availability__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('availability.index.title', 'Availabilities')}}</f7-nav-title>
      <f7-nav-right>
        <a href="#" class="save link">{{$t('common.save', 'Save')}}</a>
      </f7-nav-right>
    </f7-navbar>

    <div class="refresh-panel" data-last-updated>
      {{$t('common.last_updated', 'Last updated')}}:
      <span class="time">1 min ago</span>
      <a href="#" class="refresh">{{$t('common.save', 'Refresh')}}</a>
    </div>

    <f7-list class="no-margin" v-if="items">
      <f7-list-item
        v-for="(item, key) in items"
        :key="key"
      >
        <div class="availability__list-date">
          <strong>{{dayOrToday(item.start_at)}}</strong>
          <span>{{formatDate(item.start_at, 'Do MMM')}}</span>
        </div>
        <div class="availability__toggle-container">
          <!-- item-title -->
          <a
            href="#"
            :class="availabilityClass('am', item.data)"
            class="availability__toggle-availability"
            data-availability="am"
          >
            <span>{{$t('word.am', 'am')}}</span>
          </a>
          <a
            href="#"
            class="availability__toggle-availability {{}}"
            :class="availabilityClass('pm', item.data)"
            data-availability="pm"
          >
            <span>{{$t('word.pm', 'pm')}}</span>
          </a>
          <a
            href="#"
            class="availability__toggle-availability"
            :class="availabilityClass('nd', item.data)"
            data-availability="nd"
          >
            <span>{{$t('word.nd', 'nd')}}</span>
          </a>
          <form>
            <input type="hidden" name="start_at" :value="formatDate(item.start_at, 'YYYY-MM-DD')" />
            <input type="text" name="am" :value="availabilityValue('am', item.data)"/>
            <input type="text" name="pm" :value="availabilityValue('pm', item.data)"/>
            <input type="text" name="nd" :value="availabilityValue('nd', item.data)"/>
          </form>
        </div>
      </f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  export default {
    data() {
      const self = this;
      const items = {};
      const startAt = self.$moment().subtract(1, 'day').startOf('day');
      const endAt = self.$moment().add(2, 'weeks').endOf('week');
      const current = startAt.clone();
      while (current.add(1, 'day') < endAt) {
        const date = current.format('YYYY-MM-DD');
        if (!items[date]) {
          items[date] = {
            start_at: current.format(),
            data: {},
          };
        }
      }
      return {
        items,
      };
    },
    methods: {
      dayOrToday(date) {
        const self = this;
        const time = self.$moment(date);
        if (time.isSame(self.$moment(), 'day')) return 'Today';
        return time.format('dddd');
      },
      formatDate(date, format) {
        const self = this;
        const localTime = self.$moment.utc(date).toDate();
        return self.$moment(localTime).format(format);
      },
      availabilityClass(shift, data) {
        if (data && (data[shift] === -1 || data[shift] === '-1')) return 'unavailable';
        if (data && (data[shift] === 1 || data[shift] === '1')) return 'available';
        return '';
      },
      availabilityValue(shift, data) {
        if (data && data[shift]) return data[shift];
        return 0;
      },
    },
  };
</script>

