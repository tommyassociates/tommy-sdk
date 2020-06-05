<template>
  <f7-page class="time-clock-main-page" :page-content="false"
           @page:beforeremove="onPageBeforeRemove"
           @page:beforeout="onPageBeforeOut">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('time_sheets.index.title')}}</f7-nav-title>
      <f7-nav-right class="time-sheets-navbar-links">
        <f7-link href="/time-sheets/add/" icon-only>
          <f7-icon f7="plus"/>
        </f7-link>
        <f7-link href="/time-sheets/search/" icon-only>
          <f7-icon f7="search"/>
        </f7-link>
        <f7-link href="/time-sheets/settings/" icon-only>
          <f7-icon f7="gear"/>
        </f7-link>
        <f7-link icon-only @click="addTimesheet">
          <f7-icon f7="add"></f7-icon>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>


    <f7-page-content>
      <!--Events -->
      <Events
        :data="formattedTimesheetsData"
        :loaded="true"
        v-if="timesheetsData.length"
      />
    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from "../api";
  import TimesheetService from "../services/timesheet-service";


  import ActiveAvatar from "../components/circle-avatar.vue";
  import Events from "../components/events.vue";
  import timePeriodPicker from "../mixins/time-period-picker.vue";

  /*
  TODO: add shift empty page

  */
  export default {
    name: "TimeSheets",
    data() {
      const self = this;
      return {
        timesheetsData: [],
        timesheetsShiftsData: [],
        loaded: false,
        timesheetStartDay: 'sun',
        timesheetDuration: 'week', //week fortnight month
      };
    },
    components: {
      ActiveAvatar,
      Events,
    },
    mixins: [timePeriodPicker],
    created() {
      const self = this;
      API.actorId = API.getUserId(self);
      API.actor = API.getActor(self);

      self.$events.$on("time_sheets:timesheet_edited", self.updateAll);
      self.$events.$on("time_sheets:timesheet_created", self.updateAll);
      self.$events.$on("time_sheets:timesheet_deleted", self.updateAll);

      self.$events.$on("time_sheets:timesheet_shift_edited", self.updateAll);
      self.$events.$on("time_sheets:timesheet_shift_created", self.updateAll);
      self.$events.$on("time_sheets:timesheet_shift_deleted", self.updateAll);

    },
    computed: {
      toolbarStyle() {
        const self = this;
        if (self.clock_on && !self.break_on) {
          return {
            height: "136px"
          };
        } else {
          return {
            height: "74px"
          };
        }
      },
      formattedTimesheetsData() {
        const self = this;
        return TimesheetService.formatTimesheetsData(self.timesheetsData, self.timesheetsShiftsData, self);
      }
    },
    methods: {
      addTimesheet() {
        const self = this;
        self.openTimePeriodPicker();
      },
      onPageBeforeRemove() {
        const self = this;
      },
      onPageBeforeOut() {
        const self = this;
      },

      updateAll() {
        const self = this;
        API.getTimesheets().then(timesheets => {
          self.timesheetsData = timesheets;
          console.table(timesheets);
          API.getTimesheetsShifts().then(timesheetsShifts => {
            self.timesheetsShiftsData = timesheetsShifts;
            console.table(timesheetsShifts);
            self.loaded = true;
          });
        });
      },
    },
    beforeDestroy() {
      const self = this;

      self.$events.$off("time_sheets:timesheet_edited", self.updateAll);
      self.$events.$off("time_sheets:timesheet_created", self.updateAll);
      self.$events.$off("time_sheets:timesheet_deleted", self.updateAll);

      self.$events.$off("time_sheets:timesheet_shift_edited", self.updateAll);
      self.$events.$off("time_sheets:timesheet_shift_created", self.updateAll);
      self.$events.$off("time_sheets:timesheet_shift_deleted", self.updateAll);

    },
    mounted() {
      const self = this;

      return Promise.all([
        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "attendance_other_access",
          {with_filters: true}
        )
      ]).then(v => {
        // self.viewOthers = API.checkPermision(v[0], self);
        // API.getAttendances(null, false, self.viewOthers).then(data => {
        //   self.attendanceData = TimesheetService.prepareAttendances(data, self);
        //   //self.formattedAttendanceData = TimesheetService.splitAttendanceIntoDays(self.attendanceData, self);
        //   self.loaded.attendance = true;
        //   self.loaded.first = true;
        //   self.updateStatus();
        //   self.calculateDuration();
        // });
        // API.getAttendancesActive(null, false, self.viewOthers).then(data => {
        //   self.activeData = TimesheetService.prepareAttendance(data, self);
        //   if (self.activeData !== null) {
        //     // self.formattedActiveData = TimesheetService.formatAttendanceActive(self.activeData, self);
        //     self.loaded.timestamp = self.activeData.timestamp;
        //   }
        //   self.loaded.active = true;
        // });



        self.updateAll();
        self.$nextTick(() => {
          self.createTimePeriodPicker(self.timesheetStartDay, self.timesheetDuration);
        });

      });


    },

  };
</script>
