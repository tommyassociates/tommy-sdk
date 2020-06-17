<template>
  <f7-page
    class="time-sheet-detail-page"
  >
    <template v-if="isTeamManager">
      <f7-navbar>
        <tommy-nav-back></tommy-nav-back>
        <f7-nav-title>{{$t(`time_sheets.manager.${status}_label`)}}</f7-nav-title>
        <f7-nav-right class="whs-navbar-links">
          <f7-link icon-only @click="toggleSelectMultiple()" :style="`${isMultipleSelected?'':'color:black'}`"
                   v-if="canUpdateTimesheetStatus">
            <select-multiple-icon></select-multiple-icon>
          </f7-link>
        </f7-nav-right>
      </f7-navbar>
      <f7-toolbar v-if="loaded && isMultipleSelected && canUpdateTimesheetStatus">
        <f7-button @click="denyBulkClick()" :class="denyBulkButtonClasses">
          {{$t('time_sheets.manager.deny_button')}}
        </f7-button>
        <f7-button @click="approveBulkClick()" :class="approveBulkButtonClasses">
          {{$t('time_sheets.manager.approve_button')}}
        </f7-button>
      </f7-toolbar>


      <template v-if="loaded">


        <template v-if="formattedManagerTimesheetsData.length">
          <template v-if="isMultipleSelected">
            <f7-list media-list class="time-sheet-list">
              <f7-list-item
                checkbox
                checkbox-icon="start"
                :title="$t('time_sheets.manager.select_all')"
                @change="selectAllClick()"
                v-model="selectAll"
                input-value="1"
                :checked="selectAll === 'selected'"
              >
              </f7-list-item>

              <f7-list-item
                checkbox
                checkbox-icon="start"
                v-for="(timesheet, index) in formattedManagerTimesheetsData"
                :key="'timesheet_'+index"
                :title="timesheet.title"
                :subtitle="`${timesheet.description ? timesheet.description : ''}`"
                @change="toggleSelectedTimesheet(timesheet)"
                v-model="timesheet.isSelected"
                input-value="1"
                :checked="timesheet.isSelected === 'selected'"
                :link="`/time-sheets/manager/time-sheets/detail/${timesheet.id}`"
              >
                <div slot="media">
                  <circle-avatar :data="timesheet.teamMember" :size="60" :display-image="false"></circle-avatar>
                </div>
              </f7-list-item>
            </f7-list>
          </template>

          <template v-else>
            <template v-if="canUpdateTimesheetStatus">
              <f7-list media-list class="time-sheet-list">
                <f7-list-item
                  swipeout
                  v-for="(timesheet, index) in formattedManagerTimesheetsData"
                  :key="'timesheet_'+index"
                  :title="timesheet.title"
                  @swipeout:deleted="onSwipeoutDeleted(timesheet)"
                  :link="`/time-sheets/manager/time-sheets/detail/${timesheet.id}`"
                >
                  <div slot="media">
                    <circle-avatar :data="timesheet.teamMember" :size="60" :display-image="false"></circle-avatar>
                  </div>

                  <div slot="subtitle">
                    <div class="item-subtitle__items-description">
                    {{ timesheet.itemsDescription }}
                    </div>
                    <div class="item-subtitle__work-hours-description">
                    {{ timesheet.workHoursDescription }}
                    </div>
                  </div>

                  <f7-swipeout-actions right>
                    <f7-swipeout-button delete @click="denyTimesheet(timesheet.id)" class="swipeout-standard">Deny
                    </f7-swipeout-button>
                    <f7-swipeout-button delete @click="approveTimesheet(timesheet.id)">Approve</f7-swipeout-button>
                  </f7-swipeout-actions>
                </f7-list-item>
              </f7-list>
            </template>
            <template v-else>
              <f7-list media-list class="time-sheet-list">
                <f7-list-item
                  v-for="(timesheet, index) in formattedManagerTimesheetsData"
                  :key="'timesheet_'+index"
                  :title="timesheet.title"
                  :subtitle="`${timesheet.description ? timesheet.description : ''}`"
                  :link="`/time-sheets/manager/time-sheets/detail/${timesheet.id}`"
                >
                  <div slot="media">
                    <circle-avatar :data="timesheet.teamMember" :size="60" :display-image="false"></circle-avatar>
                  </div>
                </f7-list-item>
              </f7-list>
            </template>

          </template>
        </template>

        <template v-else>
          <div class="p-16 text-align-center">
            <img :src="`${addonAssetsUrl()}no-items-found.svg`">
            <p>{{ $t('time_sheets.timesheet_details.items_none') }}</p>
          </div>
        </template>


      </template>

      <f7-list media-list v-if="!loaded" class="skeleton-effect-blink skeleton-text">
        <f7-list-item title="__________" after="________"></f7-list-item>
        <f7-list-item title="__________" after="________"></f7-list-item>
        <f7-list-item title="__________">
          <div slot="after" class="after-container">
            <div class="name">_______</div>
            <div class="image"></div>
          </div>
        </f7-list-item>
        <f7-list-item title="__________" after="________"></f7-list-item>
        <f7-list-item title="__________">
          <div slot="after" class="after-container">
            <div class="image"></div>
          </div>
        </f7-list-item>
        <f7-list-item title="__________" after="________"></f7-list-item>
      </f7-list>


    </template>

  </f7-page>
</template>
<script>
  import API from "../../api";
  import addonAssetsUrl from '../../utils/addon-assets-url';
  import TimesheetService from "../../services/timesheet-service";
  import circleAvatar from "tommy-core/src/components/circle-avatar";
  import SelectMultipleIcon from "../../components/icons/select-multiple-icon";


  export default {
    name: "TimesheetsManagerTimesheets",
    components: {
      SelectMultipleIcon,
      circleAvatar
    },
    methods: {
      addonAssetsUrl,
      deleteTimesheet() {
        const self = this;
        // if (!self.editAccess) return;
        API.deleteTimesheet(self.timesheet.id, false).then((response) => {
          console.log('deleteTimesheet', response);
          self.$f7router.back();
          self.$events.$emit("time_sheets:timesheet_deleted", self.timesheet);
        });
      },
      deleteClick() {
        const self = this;
        self.confirmDialog(
          false,
          self.$t("time_sheets.timesheet_details.delete_text"),
          self.$t("time_sheets.timesheet_details.confirm_button"),
          self.$t("time_sheets.timesheet_details.cancel_button"),
          self.deleteTimesheet,
          false,
          null,
          true,
          false
        );
      },
      dateRangeFormat(startDate = '', endDate = '') {
        const self = this;
        return TimesheetService.dateRangeFormat(startDate, endDate, self);
      },

      onSwipeoutDeleted(timesheetShift) {
        const self = this;
        const timesheetId = timesheetShift.id;
        // if (!self.editAccess) return;
        // API.removeItemFromCache('workforce/timesheet_items', 'id', timesheetId).then((updatedCache) => {
        //   self.timesheetsItemsData = updatedCache;
        // });

        API.deleteTimesheetShift(timesheetId).then(response => {
          console.log('deleteTimesheetShift', response);
          self.$events.$emit("time_sheets:timesheet_shift_deleted");
        });

        // API.removeItemFromObject(self.timesheetsShiftsData, 'id', timesheetId).then(newData => {
        //   self.timesheetsShiftsData = newData;
        //   // API.removeItemFromCache('workforce/timesheet_items', 'id', timesheetId);
        // });
      },

      denyTimesheet(timesheetId) {
        const self = this;
        const data = {
          status: 'denied'
        };
        API.updateTimesheet(timesheetId, data).then(response => {
          self.$events.$emit("time_sheets:timesheet_edited");
        });
      },

      approveTimesheet(timesheetId) {
        const self = this;
        const data = {
          status: 'approved'
        };
        API.updateTimesheet(timesheetId, data).then(response => {
          self.$events.$emit("time_sheets:timesheet_edited");
        });
      },

      denyBulkClick() {
        const self = this;
        const selectedItemsCount = self.formattedManagerTimesheetsData.filter(t => t.isSelected === 'selected').length;
        if (selectedItemsCount === 0) {
          self.$f7.dialog.alert(self.$t('time_sheets.manager.deny_bulk_zero_selected'), 'Tommy');
        } else {
          self.isActionsDisabled = true;
          const data = {
            status: 'denied',
            timesheet_ids: self.selectedTimesheets,
          };
          API.updateManagerTimesheetsBulk(data).then(response => {
            self.$events.$emit("time_sheets:timesheet_edited");
          });
        }
      },

      approveBulkClick() {
        const self = this;
        const selectedItemsCount = self.formattedManagerTimesheetsData.filter(t => t.isSelected === 'selected').length;
        if (selectedItemsCount === 0) {
          self.$f7.dialog.alert(self.$t('time_sheets.manager.approve_bulk_zero_selected'), 'Tommy');
        } else {
          self.isActionsDisabled = true;
          const data = {
            status: 'approved',
            timesheet_ids: self.selectedTimesheets,
          };
          API.updateManagerTimesheetsBulk(data).then(response => {
            self.$events.$emit("time_sheets:timesheet_edited");
          });
        }
      },


      updateAll() {
        const self = this;
        API.getManagerTimesheets().then(managerTimesheets => {
          let managerTimesheetsData = managerTimesheets;
          managerTimesheetsData.forEach(timesheet => {
            timesheet.isSelected = '0';
          });

          self.managerTimesheetsData = managerTimesheetsData;
          // self.loaded = true; //This needs to be removed once API.getManagerTimesheetsShifts() is working below.
          API.getManagerTimesheetsShifts().then(managerTimesheetsShifts => {
            self.managerTimesheetsShiftsData = managerTimesheetsShifts;
            console.table(managerTimesheetsShifts);
            self.loaded = true;
          });
        });
      },

      toggleSelectMultiple() {
        console.log('toggleSelectMultiple');
        const self = this;
        self.isMultipleSelected = !self.isMultipleSelected;
      },

      selectAllClick(e) {
        const self = this;
        self.selectAll = self.selectAll === 'selected' ? '' : 'selected';

        if (self.selectAll === 'selected') {
          self.managerTimesheetsData.forEach(t => {
            if (t.status === 'submitted') {
              t.isSelected = 'selected';
            }
          });
        } else {
          self.managerTimesheetsData.forEach(t => t.isSelected = '');
        }
      },

      toggleSelectedTimesheet(timesheet) {
        const self = this;
        self.managerTimesheetsData.forEach(t => {
          if (+t.id === +timesheet.id) {
            t.isSelected = t.isSelected === 'selected' ? '' : 'selected';
          }
        });

        const itemsCount = self.formattedManagerTimesheetsData.length;
        const selectedItemsCount = self.formattedManagerTimesheetsData.filter(t => t.isSelected === 'selected').length;
        console.log({itemsCount, selectedItemsCount});
        self.selectAll = +itemsCount === +selectedItemsCount ? 'selected' : '';
      },
    },
    computed: {
      dateField() {
        const self = this;
        if (!self.detail_data) return null;
        return self.$moment(self.detail_data.timestamp).format("DD MMM YYYY");
      },
      timeField() {
        const self = this;
        if (!self.detail_data) return null;
        return self.$moment(self.detail_data.timestamp).format("H:mm");
      },

      hoursTotal() {
        const self = this;
        const timesheetShifts = self.timesheetShifts;
        const hours = timesheetShifts.reduce((totalHours, timesheetShift) => Math.trunc(totalHours) + Math.trunc(timesheetShift.work_hours), 0);
        return parseFloat(hours).toFixed(2);
      },

      timesheets() {
        const self = this;
        return self.managerTimesheetsData.filter(timesheet => timesheet.status === self.status);
      },

      isTeamMember() {
        const self = this;
        return self.$root.account.roles.includes('Team Member');
      },

      isTeamManager() {
        const self = this;
        return self.$root.account.roles.includes('Team Manager');
      },

      formattedManagerTimesheetsData() {
        const self = this;
        return TimesheetService.formattedManagerTimesheetsData(self.managerTimesheetsData, self.managerTimesheetsShiftsData, self.status, self);
      },

      denyBulkButtonClasses() {
        return {
          'button': true,
          'button--dark-text': true,
          'disabled': self.isActionsDisabled,
        }
      },

      approveBulkButtonClasses() {
        return {
          'button': true,
          'button--red-text': true,
          'button--left-divider': true,
          'disabled': self.isActionsDisabled,
        }
      },

      canUpdateTimesheetStatus() {
        const self = this;
        return self.status === 'submitted';
      },


    },
    beforeDestroy() {
      const self = this;

      self.$events.$off("time_sheets:timesheet_edited", self.updateAll);

    },
    mounted() {
      const self = this;
      // self.$api
      //   .getInstalledAddonPermission("time_sheets", "attendance_edit_access", {
      //     with_filters: true
      //   })
      //   .then(v => {
      //     console.log('permissions', v);
      //     self.edit_acces = self.checkPermision(v);

      // API.getAttendancesDetail(self.edit_id).then(data => {
      //   self.detail_data = self.prepareAttendance(data);
      //   if (typeof self.detail_data.image !== "undefined")
      //     self.image_preview = self.detail_data.image.url;
      //   self.loaded = true;
      //   if (self.edit_acces) {
      //     self.$nextTick(() => {
      //       self.createCalendar();
      //       self.createTimePicker(self.detail_data.timestamp);
      //       self.createPhotoPreview();
      //     });
      //   } else {
      //     self.$nextTick(() => {
      //       self.createPhotoPreview();
      //     });
      //   }
      // });


      // });

      //


      self.updateAll();


    },
    created() {
      const self = this;

      self.$events.$on("time_sheets:timesheet_edited", self.updateAll);
    },
    data() {
      const self = this;
      return {
        // image_preview: null,
        // sheet_action_opened: false,
        // new_action: null,
        // edit_id: self.$f7route.params.id,
        // edit_acces: false,
        // timesheetData: null,
        // timesheetItemsData: null,
        // loaded: false

        status: self.$f7route.params.status,
        managerTimesheetsData: [],
        managerTimesheetsShiftsData: [],
        loaded: false,
        isActionsDisabled: false,
        isMultipleSelected: false,
        selectAll: 0,
      };
    }
  };
</script>
