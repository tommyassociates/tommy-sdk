<template>
  <f7-page id="bookings__index" @page:afterin="loadEvents" ptr @ptr:refresh="onPtrRefresh" class="bookings__wrapper">

    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
    </f7-navbar>

    <f7-block class="no-margin no-padding">
      <div class="calendar-toolbar">
        <span class="calendar-toolbar__prev" v-if="!collapsedCalendar" @click="onPrevMonth()"></span>
        <div>
          <span class="calendar-toolbar__date">{{toolbarDate}}</span>
          <span class="calendar-toolbar__collapse" v-bind:class="{ '-rotate': collapsedCalendar }" @click="onCollapse()"></span>
        </div>
        <span class="calendar-toolbar__next" v-if="!collapsedCalendar" @click="onNextMonth()"></span>
      </div>
      <div id="calendar-container"></div>
    </f7-block>

    <f7-list media-list class="booking-events__wrapper no-margin no-padding" no-hairlines v-if="events && events.length">

      <f7-list-group media-list v-if="previousEvents.length">
        <f7-list-item group-title class="booking-events__title">Open Shifts</f7-list-item>
        <f7-list-item v-for="(event, index) in previousEvents" :key="index" link="#" @click="loadEventDetails(event)"
          :title="eventTitle(event)" :text="eventText(event)"
          class="booking-event"
        >
          <div class="item-media text-icon align-self-center" slot="content-start">
            <span>{{getDifferenceOfHours(event)}}</span>
          </div>
          <span class="booking-event__description">{{ event.title }}</span>
          <span class="booking-event__description">{{ event.location }}</span>
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
          <span class="booking-event__description">{{ event.title }}</span>
          <span class="booking-event__description">{{ event.location }}</span>
        </f7-list-item>
      </f7-list-group>

    </f7-list>

    <f7-block v-if="events && !events.length" class="no-data">
      <h2>{{$t('bookings.no_bookings', 'No shifts found')}}</h2>
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
    const today = self.$moment().startOf('day')

    return {
      events: [],
      selectedEvents: [],
      today,
      toolbarDate: '',
      collapsedCalendar: false,
    }
  },
  mounted() {
    const self = this
    const app = self.$app

    self.calendar = app.f7.calendar.create({
      containerEl: '#calendar-container',
      events: self.selectedEvents,
      firstDay: 0,
      toolbar: false,
      touchMove: false,
    })

    self.getToolbarDate()
    self.onCollapse()
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
        return self.$moment(event.start_at) < self.today;
      });
    },
  },
  methods: {
    getSelectedEvents(events) {
      const selectedEvents = events.map(event => {
        const { start_at, end_at } = event
        const color = '#ff4500'

        if (end_at) {
          return { from: start_at, to: end_at, color }
        } else {
          return { date: start_at, color }
        }
      })

      return selectedEvents
    },
    getToolbarDate() {
      const self = this
      const { currentMonth, currentYear, params } = self.calendar

      return self.toolbarDate = params.monthNames[currentMonth] + ' ' + currentYear
    },
    getDifferenceOfHours(event) {
      const self = this
      const { start_at, end_at } = event

      if (end_at) {
        const diffHours = self.$moment(end_at).diff(self.$moment(start_at), 'hours', true)
        const formatHours = diffHours.toFixed(1).replace(/\.0$/, '')

        return formatHours
      } else {
        return '-'
      }
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
      const currentDay = new Date().getDate()
      const weekOfMonth = Math.ceil((firstDayOfMonth + currentDay) / 7)
      const calendar = document.getElementById('calendar-container')
      const rows = document.getElementsByClassName('calendar-month-current')[0].childNodes

      Array.prototype.forEach.call(rows, (row, index) => {
        if (index === weekOfMonth - 1) return
        self.collapsedCalendar ? row.classList.remove('-hide') : row.classList.add('-hide')
      })

      self.collapsedCalendar ? calendar.classList.remove('collapsed') : calendar.classList.add('collapsed')
      self.collapsedCalendar = !self.collapsedCalendar
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
      const self = this

      return API.getWorkforceShifts().then(events => {
        self.events = events
        self.selectedEvents = self.getSelectedEvents(events)
        console.log(self.calendar.getValue())
        self.calendar.setValue([new Date(2020, 2, 7)])
        console.log(self.calendar.getValue())
        self.calendar.update()
      })
    }
  }
};
</script>
