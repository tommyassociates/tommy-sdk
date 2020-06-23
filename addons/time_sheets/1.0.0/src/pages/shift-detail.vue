<template>
  <f7-page
    class="time-sheet-detail-page "
    @page:beforeremove="onPageBeforeRemove"
    @page:beforeout="onPageBeforeOut"
  >
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_sheets.timesheet_details_shift.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="saveTimesheetShift" v-if="timesheetShiftChanged && canEditTimesheetShift">
          <f7-icon f7="check" color="orange"/>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-toolbar v-if="canDeleteTimesheetShift">
      <f7-button @click="deleteClick()">{{$t('time_sheets.timesheet_details_shift.delete_button')}}</f7-button>
    </f7-toolbar>
    <template v-if="loaded">
      <f7-list media-list class="topset list-with-fields inline-labels">
        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.start_date_label', 'Start date')"
                      @click.native="openCalendar()">
          <div class="item-input-wrap">
            {{startDateFormatted}}
          </div>

        </f7-list-item>

        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.work_hours_label', 'Work hours')"
                      @click.native="openWorkHoursTimePicker">
          <div class="item-input-wrap">
            {{timesheetShift.work_hours}}
          </div>
        </f7-list-item>

        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.break_hours_label', 'Break hours')"
                      @click.native="openBreakHoursTimePicker">
          <div class="item-input-wrap">
            {{timesheetShift.break_hours}}
          </div>
        </f7-list-item>


      </f7-list>


      <f7-block-title class="time-clock-divider">{{ $t('time_sheets.timesheet_details_shift.role_title') }}
      </f7-block-title>

      <f7-list media-list class="topset list-with-fields inline-labels">
        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.role_label')">
          <f7-input type="text" name="role"
                    :value="timesheetShift.role"
                    @input="timesheetShift.role = $event.target.value; updateTimesheetShiftChanged();"
                    :readonly="!canEditTimesheetShift"></f7-input>
        </f7-list-item>
      </f7-list>


      <f7-block-title class="time-clock-divider">{{ $t('time_sheets.timesheet_details_shift.location_title') }}
      </f7-block-title>
      <f7-list media-list class="topset list-with-fields inline-labels">
        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.location_label')">
          <f7-input type="text" name="location"
                    :value="timesheetShift.location_name"
                    @input="timesheetShift.location_name = $event.target.value; updateTimesheetShiftChanged();"
                    :readonly="!canEditTimesheetShift"></f7-input>
        </f7-list-item>
        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.address_label')">
          <f7-input type="text" name="address"
                    :value="timesheetShift.address"
                    @input="timesheetShift.address = $event.target.value; updateTimesheetShiftChanged();"
                    :readonly="!canEditTimesheetShift"></f7-input>
        </f7-list-item>
      </f7-list>


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


  </f7-page>
</template>
<script>
  import API from "../api";
  import dialog from "../mixins/dialog.vue";
  import workHoursTimePicker from "../mixins/work-hours-time-picker.vue";
  import breakHoursTimePicker from "../mixins/break-hours-time-picker.vue";
  import TimesheetService from "../services/timesheet-service";


  export default {
    name: "TimesheetShiftDetail",
    mixins: [dialog, workHoursTimePicker, breakHoursTimePicker],
    methods: {
      saveTimesheetShift() {
        console.log('saveTimesheetShift');
        const self = this;

        if (self.timesheetId) {
          console.log('is timesheet shift', self.timesheetId);
          const timesheetShiftData = {...self.timesheetShift};
          console.log('timesheetShiftData', timesheetShiftData);
          API.createTimesheetShift(timesheetShiftData).then((response) => {
            console.log('createTimesheetShift response', response);
            self.$f7router.back();
            self.$events.$emit("time_sheets:timesheet_shift_created", self.timesheetShift);
          });

        } else {
          console.log('NOT timesheet shift');
          const timesheetShiftData = {...self.timesheetShift};
          delete timesheetShiftData.id;
          console.clear();
          console.log(timesheetShiftData);
          API.updateTimesheetShift(self.edit_id, timesheetShiftData).then(() => {
            self.$f7router.back();
            self.$events.$emit("time_sheets:timesheet_shift_edited", self.timesheetShift);
          });
        }

      },
      deleteTimesheet() {
        const self = this;
        if (!self.editAccess) return;
        API.deleteTimesheetShift(self.edit_id).then((response) => {
          console.log('deleteTimesheetShift', response);
          self.$f7router.back();
          self.$events.$emit("time_sheets:timesheet_shift_deleted", self.timesheet);
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
      openCalendar() {
        const self = this;
        // if (self.editAccess) self.calendarInstance.open();
        if (!self.canEditTimesheetShift) return;
        self.calendarInstance.open();
      },
      createCalendar() {
        const self = this;
        let date = self.timesheetId ?
          new Date(self.timesheet.start_date) :
          self.timesheetShift.start_date ?
            new Date(self.timesheetShift.start_date) :
            new Date(self.timesheet.start_date);

        self.calendarInstance = self.$f7.calendar.create({
          value: [date],
          openIn: "customModal",
          backdrop: true,
          closeOnSelect: true,
          minDate: self.timesheet.start_date,
          maxDate: self.timesheet.end_date,
          on: {
            change(cal, val) {
              const date = new Date(self.timesheetShift.start_date);
              const date_new = new Date(val[0]);
              date.setFullYear(date_new.getFullYear());
              date.setMonth(date_new.getMonth());
              date.setDate(date_new.getDate());
              self.timesheetShift.start_date = date.toISOString();
              self.updateTimesheetShiftChanged();
            }
          },
        });
      },
      onPageBeforeOut() {
        const self = this;
        // self.$refs.actionSheet.close();
      },
      onPageBeforeRemove() {
        const self = this;
        // self.$refs.actionSheet.$destroy();
        if (self.calendarInstance) self.calendarInstance.destroy();
        if (self.workHoursTimePicker) self.workHoursTimePicker.destroy();
        if (self.breakHoursTimePicker) self.breakHoursTimePicker.destroy();
      },
      checkPermision(p) {
        const self = this;
        let view = p.filters.find(e => {
          if (e.context === "members") {
            if (e.user_id === API.actorId) return true;
          } else if (e.context === "roles") {
            if (API.actor.roles.indexOf(e.name) > 0) return true;
          }
        });
        return typeof view !== "undefined";
      },
      openWorkHoursTimePicker() {
        const self = this;
        if (!self.canEditTimesheetShift) return;
        self.workHoursTimePickerInstance.open();
      },
      openBreakHoursTimePicker() {
        const self = this;
        if (!self.canEditTimesheetShift) return;
        self.breakHoursTimePickerInstance.open();
      },


      dateRangeFormat(startDate = '', endDate = '') {
        const self = this;
        return TimesheetService.dateRangeFormat(startDate, endDate, self);
      },

      onSwipeoutDeleted(timesheetItem) {
        const self = this;
        const timesheetId = timesheetItem.id;

        // API.removeItemFromCache('workforce/timesheet_items', 'id', timesheetId).then((updatedCache) => {
        //   self.timesheetsItemsData = updatedCache;
        // });

        API.removeItemFromObject(self.timesheetsItemsData, 'id', timesheetId).then(newData => {
          self.timesheetsItemsData = newData;
        });

        //workforce/timesheet_items
        // API.deleteTimesheetItem(timesheetId);
      },

      updateTimesheetShiftChanged() {
        const self = this;
        self.timesheetShiftChanged = (JSON.stringify(self.timesheetShift) !== JSON.stringify(self.timesheetShiftOriginal));
      },


    },
    computed: {
      startDateFormatted() {
        const self = this;
        if (!self.timesheetShift.start_date) return null;
        return self.$moment(self.timesheetShift.start_date).format("DD MMM YYYY");
      },

      canDeleteTimesheetShift() {
        const self = this;
        return self.loaded && +self.edit_id > 0 && self.timesheet.status === 'unsubmitted';
      },

      canEditTimesheetShift() {
        const self = this;
        // return self.loaded && +self.edit_id > 0 && self.timesheet.status === 'unsubmitted';
        return self.loaded && self.timesheet.status === 'unsubmitted';
      },

      timesheet() {
        const self = this;
        const timesheetId = self.timesheetId ? self.timesheetId : self.timesheetShift.timesheet_id;
        return self.timesheetsData.find(timesheet => +timesheet.id === +timesheetId);
      },
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

      API.getTimesheets().then(timesheets => {
        self.timesheetsData = timesheets;


        if (self.edit_id) {
          const otherOptions = {
            limit: 200,
          };
          API.getTimesheetsShifts({otherOptions}).then(timesheetsShifts => {
            self.timesheetsShiftsData = timesheetsShifts;
            self.loaded = true;
            self.editAccess = true;

            self.timesheetShift = self.timesheetsShiftsData.find(timesheetShift => +timesheetShift.id === +self.edit_id);
            self.timesheetShiftOriginal = {...self.timesheetShift};

            self.$nextTick(() => {
              self.createCalendar();
              self.createWorkHoursTimePicker(self.timesheetShift.work_hours);
              self.createBreakHoursTimePicker(self.timesheetShift.break_hours);
            });
          });
        } else {
          self.loaded = true;
          self.editAccess = true;
          self.timesheetShift = {
            team_id: self.$root.account.team_id,
            user_id: self.$root.account.user_id,
            timesheet_id: self.timesheetId,
            start_date: self.timesheet.start_date,
            work_hours: '0.0',
            break_hours: '0.0',
          };
          self.timesheetShiftOriginal = {...self.timesheetShift};

          self.$nextTick(() => {
            self.createCalendar();
            self.createWorkHoursTimePicker(self.timesheetShift.work_hours);
            self.createBreakHoursTimePicker(self.timesheetShift.break_hours);
          });
        }
      });


    },
    created() {
      const self = this;
    },
    data() {
      const self = this;
      return {

        edit_id: self.$f7route.params.id,
        timesheetId: self.$f7route.params.timesheetId, //new timesheet shift
        editAccess: false,
        timesheetsData: [],
        timesheetsShiftsData: [],
        loaded: false,
        timesheetShiftChanged: false,
        timesheetShiftOriginal: {},
        timesheetShift: {},
      };
    }
  };
</script>
