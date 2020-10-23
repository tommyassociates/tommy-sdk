<template>
  <f7-page class="time-sheets__settings-page time-sheets__page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_sheets.settings.title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-only class="back">
          <f7-icon f7="check"/>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-page-content ref="pageContent">

      <f7-list>
        <f7-list-item :title="$t('time_sheets.settings.time_period_label')">
          <time-period-select
            v-model="settings.time_period"
            @change="onTimePeriodChange"
            @save="onTimePeriodSave">
          </time-period-select>
        </f7-list-item>
        <f7-list-item :title="$t('time_sheets.settings.week_start_label')">
          <day-select
            v-model="settings.week_start"
            @change="onWeekStartChange"
            @save="onWeekStartSave">
          </day-select>
        </f7-list-item>
      </f7-list>

      <f7-block-title class="time-sheets__divider">{{$t('time_sheets.settings.who_can_create_timesheets_title')}}
      </f7-block-title>
      <f7-list>
        <role-select
          title=""
          v-model="permissions.timesheets_create_access.filters"
          @save="onWhoCanCreateTimesheetsSave"
        ></role-select>
      </f7-list>

      <f7-block-title class="time-sheets__divider">{{$t('time_sheets.settings.who_can_edit_timesheets_title')}}
      </f7-block-title>
      <f7-list>
        <role-select
          title=""
          v-model="permissions.timesheets_edit_access.filters"
          @save="onWhoCanEditTimesheetsSave"
        ></role-select>
      </f7-list>

      <f7-block-title class="time-sheets__divider">{{$t('time_sheets.settings.who_can_view_other_timesheets_title')}}
      </f7-block-title>
      <f7-list>
        <role-select
          title=""
          v-model="permissions.timesheets_other_access.filters"
          @save="onWhoCanViewOtherTimesheetsSave"
        ></role-select>
      </f7-list>

      <f7-block-title class="time-sheets__divider">{{$t('time_sheets.settings.who_can_create_timesheets_shifts_title')}}
      </f7-block-title>
      <f7-list>
        <role-select
          title=""
          v-model="permissions.timesheets_shifts_create_access.filters"
          @save="onWhoCanCreateTimesheetsShiftsSave"
        ></role-select>
      </f7-list>

      <f7-block-title class="time-sheets__divider">{{$t('time_sheets.settings.who_can_edit_attendances')}}
      </f7-block-title>
      <f7-list>
        <role-select
          title=""
          v-model="permissions.attendance_edit_access.filters"
          @save="onWhoCanEditAttendancesSave"
        ></role-select>
      </f7-list>

      <f7-block-title class="time-sheets__divider">{{$t('time_sheets.settings.who_can_view_other_attendances')}}
      </f7-block-title>
      <f7-list>
        <role-select
          title=""
          v-model="permissions.attendance_other_access.filters"
          @save="onWhoCanViewOtherAttendancesSave"
        ></role-select>
      </f7-list>



    </f7-page-content>





  </f7-page>
</template>

<script>
  import API from '../api';

  import timePeriodSelect from 'tommy-core/src/components/time-period-select.vue';
  import daySelect from 'tommy-core/src/components/day-select.vue';

  import permissionSelect from 'tommy-core/src/components/permission-select.vue';
  import roleSelect from 'tommy-core/src/components/role-select';

  // import tagSelect from '../components/tag-select.vue';

  export default {
    name: "TimeSheetSettings",
    components: {
      timePeriodSelect,
      daySelect,
      permissionSelect,
      roleSelect,
    },
    mounted() {
      const self = this;
      // self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_create_access', {
      //   resource_id: undefined,
      //   with_filters: true,
      // }).then((permission) => {
      //   permission.resource_id = undefined;
      //   self.permissions.push(permission);
      // });
      // self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_edit_access', {
      //   resource_id: undefined,
      //   with_filters: true,
      // }).then((permission) => {
      //   permission.resource_id = undefined;
      //   self.permissions.push(permission);
      // });

      // self.$api.getInstalledAddonSetting('time_sheets', 'time_sheets').then(response => {
      //   const self=this;
      //   self.settings.day = response !== null && response.data && response.data.day ? response.data.day : 'mon';
      //   self.settings.timePeriod = response !== null && response.data && response.data.timePeriod ? response.data.timePeriod : 'week';
      // });


      return Promise.all([

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "timesheets_create_access",
          {with_filters: true}
        ),

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "timesheets_edit_access",
          {with_filters: true}
        ),

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "timesheets_other_access",
          {with_filters: true}
        ),

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "timesheets_shifts_create_access",
          {with_filters: true}
        ),

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "attendance_edit_access",
          {with_filters: true}
        ),

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "attendance_other_access",
          {with_filters: true}
        ),



      ]).then(permissions => {
        console.log(permissions);

        permissions.map(permission => {
          self.permissions[permission.name] = permission;
        });
      });

      API.getWorkforceSettings().then(settings => {
        const self = this;
        self.settings = settings;
      });

    },
    methods: {

      onTimePeriodChange(value) {
        const self = this;
        console.log('search - date range change: ' + value);
      },

      onTimePeriodSave(value) {
        const self = this;
        console.log('search - date range save: ' + value);
        self.settings.time_period = value;
        API.updateWorkforceSettings(self.settings);
      },

      onWeekStartChange(value) {
        const self = this;
        console.log('search - dat change: ' + value);
      },

      onWeekStartSave(value) {
        const self = this;
        console.log('search - dat save: ' + value);
        self.settings.week_start = value;
        API.updateWorkforceSettings(self.settings);
      },







      onWhoCanCreateTimesheetsSave() {
        const self = this;
        const permissionName = 'timesheets_create_access';
        const permission = self.permissions[permissionName];
        self.$api.updateInstalledAddonPermission('time_sheets', permissionName, {
          with_filters: true,
          filters: JSON.stringify(permission.filters),
        });
      },


      onWhoCanEditTimesheetsSave() {
        const self = this;
        const permissionName = 'timesheets_edit_access';
        const permission = self.permissions[permissionName];
        self.$api.updateInstalledAddonPermission('time_sheets', permissionName, {
          with_filters: true,
          filters: JSON.stringify(permission.filters),
        });
      },


      onWhoCanViewOtherTimesheetsSave() {
        const self = this;
        const permissionName = 'timesheets_other_access';
        const permission = self.permissions[permissionName];
        self.$api.updateInstalledAddonPermission('time_sheets', permissionName, {
          with_filters: true,
          filters: JSON.stringify(permission.filters),
        });
      },


      onWhoCanCreateTimesheetsShiftsSave() {
        const self = this;
        const permissionName = 'timesheets_shifts_create_access';
        const permission = self.permissions[permissionName];
        self.$api.updateInstalledAddonPermission('time_sheets', permissionName, {
          with_filters: true,
          filters: JSON.stringify(permission.filters),
        });
      },

      onWhoCanEditAttendancesSave() {
        const self = this;
        const permissionName = 'attendance_edit_access';
        const permission = self.permissions[permissionName];
        self.$api.updateInstalledAddonPermission('time_sheets', permissionName, {
          with_filters: true,
          filters: JSON.stringify(permission.filters),
        });
      },

      onWhoCanViewOtherAttendancesSave() {
        const self = this;
        const permissionName = 'attendance_other_access';
        const permission = self.permissions[permissionName];
        self.$api.updateInstalledAddonPermission('time_sheets', permissionName, {
          with_filters: true,
          filters: JSON.stringify(permission.filters),
        });
      },
    },
    data() {
      return {
        hasActorId: API.actorId,

        settings: {
          time_period: 'weekly',
          week_start: 'sunday',
        },

        permissions: {
          timesheets_create_access: [],
          timesheets_edit_access: [],
          timesheets_other_access: [],
          timesheets_shifts_create_access: [],
          attendance_edit_access: [],
          attendance_other_access: [],
        },

        whoCanViewTimesheets: [],

        //copied from broadcast.
        lists: null,
        customerPopupOpened: false,
        items: null,
        seeUser: {
          id: null,
          name: null,
        },
        sendUser: {
          id: null,
          name: null,
        },
        isSee: null,
        checkedId: null,
      };
    }
  };
</script>
