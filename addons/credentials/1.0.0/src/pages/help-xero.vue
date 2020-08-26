<template>
  <f7-page name="credentials__help-xero" id="credentials__help-xero">
    <f7-navbar>
      <!-- <tommy-nav-menu></tommy-nav-menu> -->
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>Xero Help</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>
      <div class="card">
        <div class="card-header">Xero Integration</div>
        <div class="card-content card-content-padding">
          <p>
            If you are already using Xero to manage your staff and payroll
            then you can connect your Xero account to Tommy in order to have
            employee timesheets from Tommy automatically synchronized to Xero.
          </p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">Matching Employee Records</div>
        <div class="card-content card-content-padding">
          <p>
            In order to synchronize data between Tommy and Xero for employees the
            email address will need to match on both platforms.
            This means that the email address the employee used to sign up with
            Tommy needs to match the email adress listed for the employee on Xero.
          </p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">Configuring Pay Periods</div>
        <div class="card-content card-content-padding">
          <p>
            When synchronizing timesheets from Tommy to Xero its essential that the
            time periods match between the two platforms, or synchronization will fail.
            For instance, if you use forntnightly time periods on Xero you will need to use
            the same setting on Tommy.
          </p>
          <p>
            On the <strong>Tommy</strong> side you can configure the time priod on the
            <strong>Timesheets > Settings</strong> page.
          </p>
          <p>
            On the <strong>Xero</strong> side you will need to have a payroll calendar
            configured which matches the pay period on Tommy. Please refer to the
            <a target="_blank" href="https://central.xero.com/s/article/Add-a-pay-calendar-AU">Xero documentation</a>
            for help.
          </p>
        </div>
      </div>
      <!-- <div class="card-footer">Footer</div> -->
    <!-- </f7-page-content> -->

    <!-- <f7-nav-title class="bookings-details__title">Shift Details</f7-nav-title> -->
     <!-- class="bookings-details no-margin no-padding" -->
    <!-- <f7-navbar class="bookings-details__nav">
      <tommy-nav-back class="bookings-details__back"></tommy-nav-back>
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

    <f7-button class="bookings-details__button">Request Shift</f7-button> -->

  </f7-page>
</template>

<script>
  // import formatDate from '../format-date'
  //
  // export default {
  //   props: {
  //     event: Object,
  //   },
  //   methods: {
  //     formatDate(...args) {
  //       return formatDate.call(this, ...args)
  //     },
  //   },
  // }
</script>
