<template>
  <f7-page id="bookings__details" class="bookings__details no-margin no-padding">

    <f7-navbar class="bookings__details-nav">
      <tommy-nav-back class="bookings__details-back"></tommy-nav-back>
    </f7-navbar>

    <f7-nav-title class="bookings__details-title">Shift Details</f7-nav-title>

    <f7-list no-hairlines class="bookings__details-list">
      <f7-list-item
        class="bookings__details-item"
        :header="'Location'"
        :title="event.location"
      ></f7-list-item>
      <f7-list-item
        class="bookings__details-item"
        :header="'Start'"
        :title="formatDate(event.start_at, 'D MMM YYYY hh:mm')"
      ></f7-list-item>
      <f7-list-item
        class="bookings__details-item"
        :header="'End'"
        :title="formatDate(event.end_at, 'D MMM YYYY hh:mm')"
      ></f7-list-item>
      <f7-list-item
        class="bookings__details-item"
        :header="'Shift type'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings__details-item"
        :header="'Role'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings__details-item"
        :header="'Department'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings__details-item"
        :header="'Suburb'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings__details-item"
        :header="'Status'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings__details-item"
        :header="'Notes'"
        :title="''"
      ></f7-list-item>
    </f7-list>

    <f7-button class="bookings__details-button">Request Shift</f7-button>

  </f7-page>
</template>

<script>
  import formatDate from '../format-date'

  export default {
    props: {
      event: Object,
    },
    methods: {
      formatDate(...args) {
        return formatDate.call(this, ...args)
      },
    },
  }
</script>
