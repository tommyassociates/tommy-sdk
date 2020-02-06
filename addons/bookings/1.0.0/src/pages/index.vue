<template>
  <f7-page id="bookings__index" @page:afterin="loadEvents" ptr @ptr:refresh="onPtrRefresh" class="bookings-wrapper">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('bookings.index.title', 'Bookings')}}</f7-nav-title>
    </f7-navbar>

    <f7-block>
      <div class="calendar-toolbar">
        <span class="calendar-toolbar__prev" @click="onPrevMonth()"><</span>
        <div>
          <span class="calendar-toolbar__date">{{toolbarDate}}</span>
          <span class="calendar-toolbar__collapse" @click="onCollapse()">^</span>
        </div>
        <span class="calendar-toolbar__next" @click="onNextMonth()">></span>
      </div>
      <div id="calendar-container"></div>
    </f7-block>

    <f7-list media-list class="booking-events__wrapper" no-hairlines v-if="events && events.length">

      <f7-list-group media-list v-if="previousEvents.length">
        <f7-list-item group-title class="booking-events__title">Previous</f7-list-item>
        <f7-list-item v-for="(event, index) in previousEvents" :key="index" link="#" @click="loadEventDetails(event)"
          :title="eventTitle(event)" :text="eventText(event)"
          class="booking-event"
        >
          <div class="item-media text-icon align-self-center" slot="content-start">
            <span>{{getDifferenceOfHours(event)}}</span>
          </div>
          <span class="booking-event__description">Glod Coast University</span>
          <span class="booking-event__description">Hospital</span>
        </f7-list-item>
      </f7-list-group>

      <f7-list-group media-list v-if="currentEvents.length">
        <f7-list-item group-title class="booking-events__title">Current</f7-list-item>
        <f7-list-item v-for="(event, index) in currentEvents" :key="index" link="#" @click="loadEventDetails(event)"
          :title="eventTitle(event)" :text="eventText(event)"
          class="booking-event booking-label -processing"
        >
          <div class="item-media text-icon align-self-center" slot="content-start">
            <span>{{getDifferenceOfHours(event)}}</span>
          </div>
          <span class="booking-event__description">Glod Coast University</span>
          <span class="booking-event__description">Hospital</span>
        </f7-list-item>
      </f7-list-group>

    </f7-list>

    <f7-block v-if="events && !events.length" class="no-data">
      <h2>{{$t('bookings.no_bookings', 'No bookings have been assigned')}}</h2>
      <p>{{$t('bookings.no_bookings_hint', 'Please check again later...')}}</p>
    </f7-block>
  </f7-page>
</template>
<script>

import formatDate from '../format-date'
import API from '../api'

export default {
  data() {
    const self = this

    const start_at = self.$moment().startOf('day')
    const end_at = self.$moment().endOf('day')
    const fakeEvents = [
      { start_at: start_at, end_at: end_at },
      { start_at: start_at, end_at: end_at },
    ]

    return {
      events: fakeEvents,
      today: self.$moment().startOf("day"),
      toolbarDate: '',
      collapseCalendar: true,
    };
  },
  mounted() {
    const self = this
    const app = self.$app

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekLater = new Date().setDate(today.getDate() + 7);

    self.calendar = app.f7.calendar.create({
      containerEl: '#calendar-container',
      toolbar: false,
      value: [now],
      firstDay: 0,
      touchMove: false,
      events: [
        {
          from: today,
          to: weekLater,
          color: 'pink'
        },
        {
          date: today,
          color: 'blue'
        },
        {
          date: today,
          color: 'red'
        },
      ],
    })

    self.getToolbarDate()
  },
  computed: {
    currentEvents() {
      const self = this;
      return self.events.filter(event => {
        return self.$moment(event.start_at) >= self.today;
      });
    },
    previousEvents() {
      const self = this;
      return self.events.filter(event => {
        return self.$moment(event.start_at) <= self.today;
      });
    },
  },
  methods: {
    getToolbarDate() {
      const self = this
      const { currentMonth, currentYear, params } = self.calendar

      return self.toolbarDate = params.monthNames[currentMonth] + ' ' + currentYear
    },
    getEvents() {
      const self = this

      API.getEvents().then(data => self.events = data)
    },
    getDifferenceOfHours(event) {
      const { start_at, end_at } = event

      const diffHours = end_at.diff(start_at, 'hours', true)
      const formatHours = diffHours.toFixed(1).replace(/\.0$/, '')

      return formatHours
    },
    eventTitle(event) {
      const self = this;
      let title = self.formatDate(event.start_at, "h:mm a");
      if (event.end_at) {
        title += ` - ${self.formatDate(event.end_at, "h:mm a")}`;
      }
      return title;
    },
    eventText(event) {
      let text = event.title;
      if (event.location) {
        text += ` at ${event.location}`;
      }
      return text;
    },
    formatDate(...args) {
      return formatDate.call(this, ...args);
    },
    loadEventDetails(event) {
      const self = this;
      self.$f7router.navigate("/bookings/details/", { props: { event } });
    },
    onCollapse() {
      const self = this
      const firstDayOfMonth = self.$moment().startOf('month').weekday()
      const currentDay = self.$moment().weekday()
      const weekOfMonth = Math.ceil((firstDayOfMonth + currentDay) / 7)
      const rows = document.getElementsByClassName('calendar-month-current')[0].childNodes

      Array.prototype.forEach.call(rows, (row, index) => {
        if (index === weekOfMonth - 1) return
        self.collapseCalendar ? row.classList.add('-hide') : row.classList.remove('-hide')
      })

      self.collapseCalendar = !self.collapseCalendar
    },
    onNextMonth() {
      const { calendar } = this
      calendar.nextMonth(500)
      this.getToolbarDate()
    },
    onPrevMonth() {
      const { calendar } = this
      calendar.prevMonth(500)
      this.getToolbarDate()
    },
    onPtrRefresh(event, done) {
      const self = this;
      self.loadEvents().then(() => {
        if (done) {
          done();
        }
      });
    },
    loadEvents() {
      const self = this;
      const actor_id = self.$f7route.query.actor_id;
      const params = {
        addon: "bookings",
        kind: "Booking",
        user_id: actor_id || self.$root.user.id
      };
      if (actor_id) {
        params.actor_id = actor_id;
      }
      return self.$api.getEvents(params, { cache: false }).then(events => {
        // self.events = events;
      });
    }
  }
};
</script>
