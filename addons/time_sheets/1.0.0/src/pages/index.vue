<template>
  <f7-page class="time-clock-main-page" :page-content="false"
           @page:beforeremove="onPageBeforeRemove"
           @page:beforeout="onPageBeforeOut">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <template v-if="!permissions.canViewOthers">
        <f7-nav-title>{{$t('time_sheets.index.title')}}</f7-nav-title>
      </template>
      <template v-if="permissions.canViewOthers">
        <f7-nav-title>{{$t('time_sheets.index.manager_title')}}</f7-nav-title>
      </template>
      <f7-nav-right class="time-sheets-navbar-links">
        <f7-link icon-only @click="addTimesheet" v-if="permissions.canCreate">
          <f7-icon f7="add"></f7-icon>
        </f7-link>
        <f7-link href="/time-sheets/settings/" icon-only v-if="isTeamAdmin">
          <f7-icon f7="gear"/>
        </f7-link>
      </f7-nav-right>


    </f7-navbar>


    <f7-page-content>
      <template v-if="!permissions.canViewOthers">
        <!--Events -->
        <Events
          :data="formattedTimesheetsData"
          :loaded="true"
          v-if="timesheetsData.length"
        />
      </template>
      <template v-if="permissions.canViewOthers && loaded">
        <f7-list>

          <date-range-select
            v-model="searchDateRange"
            @change="onDateRangeChange"
            @save="onDateRangeSave"
          ></date-range-select>

          <tag-select
            title=""
            v-model="searchTags"
            refs="searchTags"
            @change="onTagsChange"
            @save="onTagsSave"
          ></tag-select>
          <!--
          <f7-searchbar
            class=""
            :placeholder="$t('time_sheets.search.search_placeholder')"
            customSearch
            :backdrop="false"
            disableButton
            :disable-button-text="$t('time_sheets.search.search_disable_button')"
            :value="search"
            @input="onSearchbarSearch($event.target.value)"
            @searchbar:clear="onSearchbarClear"
            @searchbar:enable="searchEnabled = true"
            @searchbar:disable="searchEnabled = false"
            ref="searhbar"
          />-->
        </f7-list>

        <f7-list>
          <f7-list-item :title="$t('time_sheets.manager.unsubmitted_label')"
                        :link="'/time-sheets/manager/time-sheets/unsubmitted/'"
                        :badge="+unsubmittedTimesheets.length"
                        class="list-item--red-badge list-item--red-chevron">

          </f7-list-item>
          <f7-list-item :title="$t('time_sheets.manager.submitted_label')"
                        :link="'/time-sheets/manager/time-sheets/submitted/'"
                        :badge="+submittedTimesheets.length"
                        class="list-item--grey-outline-badge">

          </f7-list-item>
          <f7-list-item :title="$t('time_sheets.manager.denied_label')"
                        :link="'/time-sheets/manager/time-sheets/denied/'"
                        :badge="+deniedTimesheets.length">

          </f7-list-item>
          <f7-list-item :title="$t('time_sheets.manager.approved_label')"
                        :link="'/time-sheets/manager/time-sheets/approved/'"
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

  import TagSelect from 'tommy-core/src/components/tag-select';
  import PermissionSelect from 'tommy-core/src/components/permission-select';
  import DateRangeSelect from 'tommy-core/src/components/date-range-select';

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
          day: 'sunday',
          timePeriod: 'weekly',
        },

        // delayTimerSearch: null,
        // search: '',
        // searchEnabled: false,

        searchTags: [],
        searchDateRange: null,

        permissions: {
          canCreate: false,
          canEdit: false,
          canViewOthers: false,
        },
      };
    },
    components: {
      ActiveAvatar,
      Events,
      TagSelect,
      PermissionSelect,
      DateRangeSelect
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

      isTeamAdmin() {
        const self = this;
        return self.$root.account.roles.includes('Team Admin');
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
      // isSearch() {
      //   const self = this;
      //   return self.search;
      // }

    },
    watch: {
      searchTags: function (val) {
        const self = this;
        localStorage.timesheetsSearchTags = JSON.stringify(val);
        self.updateAll();
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
        if (!self.permissions.canViewOthers) {
          API.getTimesheets().then(timesheets => {
            self.timesheetsData = timesheets;
            const otherOptions = {
              limit: 200,
            };
            API.getTimesheetsShifts({otherOptions}).then(timesheetsShifts => {
              self.timesheetsShiftsData = timesheetsShifts;
              self.loaded = true;
            });
          });
        } else if (self.permissions.canViewOthers) {
          let otherOptions = {
            limit: 200,
          };
          // if (self.search.trim() !== '') {
          //   otherOptions.search = encodeURIComponent(self.search.trim());
          // }
          if (self.searchDateRange) {
            otherOptions.date_range = self.searchDateRange;
          }
          if (self.searchTags.length) {
            otherOptions.tags = encodeURIComponent(self.searchTags.map(tag => tag.name));
          }
          console.log(otherOptions);
          API.getManagerTimesheets({otherOptions}).then(managerTimesheets => {
            self.managerTimesheetsData = managerTimesheets;
            self.loaded = true; //This needs to be removed once API.getManagerTimesheetsShifts() is working below.

            const otherOptions = {
              limit: 200,
            };
            API.getManagerTimesheetsShifts({otherOptions}).then(managerTimesheetsShifts => {
              self.managerTimesheetsShiftsData = managerTimesheetsShifts;
              console.table(managerTimesheetsShifts);
              self.loaded = true;
            });
          });
        }
      },

      // onSearchbarSearch(val) {
      //   const self = this;
      //   self.search = val;
      //   clearTimeout(self.delayTimerSearch);
      //   self.delayTimerSearch = setTimeout(() => {
      //     self.getSearchData(val)
      //   }, 1000);
      // },
      // getSearchData(searchText) {
      //   const self = this;
      //   self.search = searchText;
      //   self.updateAll();
      // },
      // onSearchbarClear() {
      //   const self = this;
      //   self.search = '';
      //   self.updateAll();
      // },

      onDateRangeChange(value) {
        console.log('example addon: date range changed', value)
      },

      onDateRangeSave() {
        console.log('example addon: save requested');
        const self = this;
        self.updateAll();

        localStorage.timesheetsSearchDateRange = JSON.stringify(self.searchDateRange);
      },
      onTagsChange(value) {
        console.log('example addon: tags changed', value)
        localStorage.timesheetsSearchTags = JSON.stringify(value);
      },
      onTagsSave() {
        console.log('example addon: save requested');
        const self = this;
        self.updateAll();

        localStorage.timesheetsSearchTags = JSON.stringify(self.searchTags);
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

      /**
       * Use localStorage to persist the search results.
       */
      if (localStorage.timesheetsSearchDateRange) {
        self.searchDateRange = JSON.parse(localStorage.timesheetsSearchDateRange);
      }
      if (localStorage.timesheetsSearchTags) {
        self.searchTags = JSON.parse(localStorage.timesheetsSearchTags);
      }

      return Promise.all([
        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "timesheets_edit_access",
          {with_filters: true}
        ),

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "timesheets_create_access",
          {with_filters: true}
        ),

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "timesheets_other_access",
          {with_filters: true}
        ),


      ]).then(permissions => {

        console.log('Permission data', permissions);

        const canCreatePermission = permissions.find(permission => permission.name === 'timesheets_create_access');
        const canEditPermission = permissions.find(permission => permission.name === 'timesheets_edit_access');
        const canViewOthersPermission = permissions.find(permission => permission.name === 'timesheets_other_access');
        self.permissions.canCreate = API.checkPermission(canCreatePermission);
        self.permissions.canEdit = API.checkPermission(canEditPermission);
        self.permissions.canViewOthers = API.checkPermission(canViewOthersPermission);

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

        API.getWorkforceSettings().then(settings => {
          const self = this;
          self.settings = settings;

          const allowedTimePeriods = ['weekly', 'fortnightly', 'monthly'];
          const allowedWeekStarts = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          if (!allowedTimePeriods.includes(self.settings.time_period)) {
            self.settings.time_period = allowedTimePeriods[0];
          }
          if (!allowedWeekStarts.includes(self.settings.week_start)) {
            self.settings.week_start = allowedWeekStarts[0];
          }
          self.updateAll();

          self.$nextTick(() => {
            const startDay = self.settings.week_start;
            const duration = self.settings.time_period;
            const [payrollPeriodStart] = self.settings.payroll_period;
            self.createTimePeriodPicker({
              startDay,
              duration,
              payrollPeriodStart,
            });
          });
        })


      });


    },

  };
</script>
