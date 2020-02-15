<template>
  <f7-page id="bookings__details" class="bookings-details no-margin no-padding">

    <f7-navbar class="bookings-details__nav">
      <tommy-nav-back class="bookings-details__back"></tommy-nav-back>
      <f7-nav-title class="bookings-details__title">Shift Details</f7-nav-title>
    </f7-navbar>

    <f7-list no-hairlines class="bookings-details__list">
      <f7-list-item
        class="bookings-details__item"
        :header="'Location'"
        :title="event.location"
      ></f7-list-item>
      <f7-list-item
        class="bookings-details__item"
        :header="'Start'"
        :title="formatDate(event.start_at, 'D MMM YYYY hh:mm')"
      ></f7-list-item>
      <f7-list-item
        class="bookings-details__item"
        :header="'End'"
        :title="formatDate(event.end_at, 'D MMM YYYY hh:mm')"
      ></f7-list-item>
      <f7-list-item
        class="bookings-details__item"
        :header="'Shift type'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings-details__item"
        :header="'Role'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings-details__item"
        :header="'Department'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings-details__item"
        :header="'Suburb'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings-details__item"
        :header="'Status'"
        :title="''"
      ></f7-list-item>
      <f7-list-item
        class="bookings-details__item"
        :header="'Notes'"
        :title="''"
      ></f7-list-item>
    </f7-list>

    <f7-button class="bookings-details__button">Request Shift</f7-button>

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
