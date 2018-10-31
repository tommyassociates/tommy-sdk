<template>
  <f7-page id="bookings__details">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('bookings.details.title', 'Booking Details')}}</f7-nav-title>
    </f7-navbar>

    <f7-block-title>{{$t('bookings.label.details', 'Details')}}</f7-block-title>
    <f7-list no-hairlines>
      <f7-list-item
        :header="$t('bookings.label.title', 'Title')"
        :title="event.title"
      ></f7-list-item>
      <f7-list-item
        :header="$t('bookings.label.location', 'Location')"
        :title="event.location"
      ></f7-list-item>
    </f7-list>

    <f7-block-title v-if="event.start_at">{{$t('bookings.label.start', 'Start')}}</f7-block-title>
    <f7-list no-hairlines v-if="event.start_at">
      <f7-list-item
        :header="$t('bookings.label.date', 'Date')"
        :title="formatDate(event.start_at, 'D MMM YY')"
      ></f7-list-item>
      <f7-list-item
        :header="$t('bookings.label.time', 'Time')"
        :title="formatDate(event.start_at, 'h:mm a')"
      ></f7-list-item>
    </f7-list>

    <f7-block-title v-if="event.end_at">{{$t('bookings.label.end', 'End')}}</f7-block-title>
    <f7-list no-hairlines v-if="event.end_at">
      <f7-list-item
        :header="$t('bookings.label.date', 'Date')"
        :title="formatDate(event.end_at, 'D MMM YY')"
      ></f7-list-item>
      <f7-list-item
        :header="$t('bookings.label.time', 'Time')"
        :title="formatDate(event.end_at, 'h:mm a')"
      ></f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import formatDate from '../format-date';

  export default {
    props: {
      event: Object,
    },
    methods: {
      formatDate(...args) {
        return formatDate.call(this, ...args);
      },
    },
  };
</script>
