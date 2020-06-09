<template>
  <f7-page class="time-clock-main-page" :page-content="false"
           @page:beforeremove="onPageBeforeRemove"
           @page:beforeout="onPageBeforeOut">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <template v-if="isTeamMember">
        <f7-nav-title>{{$t('time_sheets.index.title')}}</f7-nav-title>
        <f7-nav-right class="time-sheets-navbar-links">
          <f7-link href="/time-sheets/add/" icon-only>
            <f7-icon f7="plus"/>
          </f7-link>
          <f7-link icon-only @click="addTimesheet">
            <f7-icon f7="add"></f7-icon>
          </f7-link>
        </f7-nav-right>
      </template>
      <template v-if="isTeamManager">
        <f7-nav-title>{{$t('time_sheets.index.manager_title')}}</f7-nav-title>
        <f7-nav-right class="time-sheets-navbar-links">
          <f7-link href="/time-sheets/settings/" icon-only>
            <f7-icon f7="gear"/>
          </f7-link>
        </f7-nav-right>
      </template>


    </f7-navbar>


    <f7-page-content>
      <template v-if="isTeamMember">
        <!--Events -->
        <Events
          :data="formattedTimesheetsData"
          :loaded="true"
          v-if="timesheetsData.length"
        />
      </template>
      <template v-if="isTeamManager && loaded">
        <f7-list>
          <f7-list-item :title="$t('time_sheets.manager.unsubmitted_label')"
                        :link="'/time-sheets/manager/unsubmitted/'"
                        :badge="+unsubmittedTimesheets.length"
                        class="list-item--red-badge list-item--red-chevron">

          </f7-list-item>
          <f7-list-item :title="$t('time_sheets.manager.submitted_label')"
                        :link="'/time-sheets/manager/submitted/'"
                        :badge="+submittedTimesheets.length"
                        class="list-item--grey-outline-badge">

          </f7-list-item>
          <f7-list-item :title="$t('time_sheets.manager.denied_label')"
                        :link="'/time-sheets/manager/denied/'"
                        :badge="+deniedTimesheets.length">

          </f7-list-item>
          <f7-list-item :title="$t('time_sheets.manager.approved_label')"
                        :link="'/time-sheets/manager/approved/'"
                        :badge="+approvedTimesheets.length">

          </f7-list-item>
        </f7-list>
      </template>
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
        managerTimesheetsData: [],
        managerTimesheetsShiftsData: [],
        loaded: false,
        settings: {
          day: 'mon',
          timePeriod: 'week',
        },
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
      formattedTimesheetsData() {
        const self = this;
        return TimesheetService.formatTimesheetsData(self.timesheetsData, self.timesheetsShiftsData, self);
      },

      isTeamMember() {
        const self = this;
        console.log('isteam member');
        console.log(self.$root.account.roles);
        return self.$root.account.roles.includes('Team Member');
      },

      isTeamManager() {
        const self = this;
        return self.$root.account.roles.includes('Team Manager');
      },

      unsubmittedTimesheets() {
        console.log('unsubmittedTimesheets');
        const self = this;
        return self.managerTimesheetsData.filter(timesheet => timesheet.status === 'unsubmitted');
      },

      submittedTimesheets() {
        const self = this;
        return self.managerTimesheetsData.filter(timesheet => timesheet.status === 'submitted');
      },

      deniedTimesheets() {
        const self = this;
        return self.managerTimesheetsData.filter(timesheet => timesheet.status === 'denied');
      },

      approvedTimesheets() {
        const self = this;
        return self.managerTimesheetsData.filter(timesheet => timesheet.status === 'approved');
      },


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
        if (self.isTeamMember) {
          API.getTimesheets().then(timesheets => {
            self.timesheetsData = timesheets;
            API.getTimesheetsShifts().then(timesheetsShifts => {
              self.timesheetsShiftsData = timesheetsShifts;
              self.loaded = true;
            });
          });
        } else if (self.isTeamManager) {
          API.getManagerTimesheets().then(managerTimesheets => {
            self.managerTimesheetsData = managerTimesheets;
            self.loaded = true; //This needs to be removed once API.getManagerTimesheetsShifts() is working below.
            API.getManagerTimesheetsShifts().then(managerTimesheetsShifts => {
              self.managerTimesheetsShiftsData = managerTimesheetsShifts;
              console.table(managerTimesheetsShifts);
              self.loaded = true;
            });
          });
        }
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

        self.$api.getInstalledAddonSetting('time_sheets', 'time_sheets').then(response => {
          const self = this;
          self.settings.day = response !== null && response.data && response.data.day ? response.data.day : 'mon';
          self.settings.timePeriod = response !== null && response.data && response.data.timePeriod ? response.data.timePeriod : 'week';
          self.updateAll();

          self.$nextTick(() => {
            self.createTimePeriodPicker(self.settings.day, self.settings.timePeriod);
          });
        });


      });


    },

  };
</script>
