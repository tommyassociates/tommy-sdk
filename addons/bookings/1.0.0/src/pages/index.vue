<template>
  <f7-page id="bookings__index" @page:afterin="loadEvents">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('bookings.index.title', 'Bookings')}}</f7-nav-title>
    </f7-navbar>
    <f7-list media-list class="no-margin transparent no-chevron" no-hairlines v-if="events && events.length">
      <f7-list-group media-list v-if="currentEvents.length">
        <f7-list-item group-title>Current</f7-list-item>
        <f7-list-item
          v-for="(event, index) in currentEvents"
          :key="index"
          link="#"
          @click="loadEventDetails(event)"
          :title="eventTitle(event)"
          :text="eventText(event)"
        >
          <div class="item-media text-icon align-self-center" slot="content-start">
            <span>{{formatDate(event.start_at, 'D')}}</span>
            <small>{{formatDate(start_at, 'MMM')}}</small>
          </div>
        </f7-list-item>
      </f7-list-group>
      <f7-list-group media-list v-if="previousEvents.length">
        <f7-list-item group-title>Previous</f7-list-item>
        <f7-list-item
          v-for="(event, index) in previousEvents"
          :key="index"
          link="#"
          @click="loadEventDetails(event)"
          :title="eventTitle(event)"
          :text="eventText(event)"
        >
          <div class="item-media text-icon align-self-center" slot="content-start">
            <span>{{formatDate(event.start_at, 'D')}}</span>
            <small>{{formatDate(start_at, 'MMM')}}</small>
          </div>
        </f7-list-item>
      </f7-list-group>
    </f7-list>
    <f7-block v-if="events && !events.length" class="no-data">
      <h2>{{$t('bookins.no_bookings', 'No bookings have been assigned')}}</h2>
      <p>{{$t('bookins.no_bookings_hint', 'Please check again later...')}}</p>
    </f7-block>
  </f7-page>
</template>
<script>
  import formatDate from '../format-date';

  export default {
    data() {
      const self = this;
      return {
        events: null,
        today: self.$moment().startOf('day'),
      };
    },
    computed: {
      currentEvents() {
        const self = this;
        return self.events.filter((event) => {
          return self.$moment(event.start_at) >= self.today;
        });
      },
      previousEvents() {
        const self = this;
        return self.events.filter((event) => {
          return self.$moment(event.start_at) < self.today;
        });
      },
    },
    methods: {
      eventTitle(event) {
        const self = this;
        let title = self.formatDate(event.start_at, 'h:mm a');
        if (event.end_at) {
          title += ` - ${self.formatDate(event.end_at, 'h:mm a')}`
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
        self.$f7router.navigate('/bookings/details/', { props: { event } });
      },
      loadEvents() {
        const self = this;
        const actor_id = self.$f7route.query.actor_id;
        const params = {
          addon: 'bookings',
          kind: 'Booking',
          user_id: actor_id || self.$root.user.id,
        };
        self.$api.getEvents(params).then((events) => {
          self.events = events;
        });
      },
    },
  };
</script>