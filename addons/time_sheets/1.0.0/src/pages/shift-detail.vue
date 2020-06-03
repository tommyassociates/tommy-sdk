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
        <f7-link icon-only @click="saveTimesheetShift" v-if="timesheetShiftChanged">
          <f7-icon f7="check" color="orange"/>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-toolbar v-if="showDeleteButton">
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

        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.work_hours_label', 'Work hours')">
          <f7-input type="numeric" name="work_hours"
                    :value="timesheetShift.work_hours"
                    @input="timesheetShift.work_hours = $event.target.value; updateTimesheetShiftChanged();"></f7-input>
        </f7-list-item>

        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.break_hours_label', 'Break hours')">
          <f7-input type="numeric" name="break_hours"
                    :value="timesheetShift.break_hours"
                    @input="timesheetShift.break_hours = $event.target.value; updateTimesheetShiftChanged();"></f7-input>
        </f7-list-item>


      </f7-list>


      <f7-block-title class="time-clock-divider">{{ $t('time_sheets.timesheet_details_shift.role_title') }}
      </f7-block-title>

      <f7-list media-list class="topset list-with-fields inline-labels">
        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.role_label')">
          <f7-input type="text" name="role"
                    :value="timesheetShift.role"
                    @input="timesheetShift.role = $event.target.value; updateTimesheetShiftChanged();"></f7-input>
        </f7-list-item>
      </f7-list>


      <f7-block-title class="time-clock-divider">{{ $t('time_sheets.timesheet_details_shift.location_title') }}
      </f7-block-title>
      <f7-list media-list class="topset list-with-fields inline-labels">
        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.location_label')">
          <f7-input type="text" name="location"
                    :value="timesheetShift.location"
                    @input="timesheetShift.location = $event.target.value; updateTimesheetShiftChanged();"></f7-input>
        </f7-list-item>
        <f7-list-item :title="$t('time_sheets.timesheet_details_shift.address_label')">
          <f7-input type="text" name="address"
                    :value="timesheetShift.address"
                    @input="timesheetShift.address = $event.target.value; updateTimesheetShiftChanged();"></f7-input>
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
  // import timePicker from "../mixins/time-picker.vue";
  import TimesheetService from "../services/timesheet-service";


  export default {
    name: "TimesheetShiftDetail",
    mixins: [dialog],
    methods: {
      // changeAction(val) {
      //   const self = this;
      //   self.detail_data.status = val;
      // },
      // setAction() {
      //   const self = this;
      //   if (self.new_action !== null)
      //     self.detail_data.event = String(self.new_action);
      // },
      // clearAction() {
      //   const self = this;
      //   self.new_action = null;
      // },
      // getPhotoCamera(photo) {
      //   const self = this;
      // },
      // openMapPage() {
      //   const self = this;
      //   const url = `https://www.google.com/maps/place/${self.detail_data.latitude}+${self.detail_data.longitude}`;
      //
      //   window.open(url, '_system', 'location=yes,hidden=yes,beforeload=yes');
      //
      //   // self.$f7router.navigate("/time-clock/map/", {
      //   //   props: {
      //   //     edit: self.edit_acces,
      //   //     latitude: self.detail_data.latitude,
      //   //     longitude: self.detail_data.longitude,
      //   //     accuracy: self.detail_data.accuracy,
      //   //     address: self.detail_data.address,
      //   //     callback: self.editCoordinates
      //   //   }
      //   // });
      // },
      // editCoordinates(latitude, longitude, accuracy, address) {
      //   const self = this;
      //   self.detail_data.latitude = latitude;
      //   self.detail_data.longitude = longitude;
      //   self.detail_data.accuracy = accuracy;
      //   self.detail_data.address = address;
      // },
      // openPhoto() {
      //   const self = this;
      //   self.$refs.actionSheet.close();
      //   self.photoPreview.open();
      // },
      // openSelector() {
      //   const self = this;
      //   if (!self.editAccess) return;
      //   self.$f7router.navigate("/time-clock/select-picker/", {
      //     props: {
      //       selected: self.detail_data.user_id,
      //       pageTitle: self.$t("time_sheets.event_details.who_label"),
      //       multiply: false,
      //       getData: self.getDataUser,
      //       type: "team",
      //       saveChange(user) {
      //         self.detail_data.user_id = user.user_id;
      //         self.detail_data.user_name = user.first_name + " " + user.last_name;
      //         self.detail_data.icon_url = user.icon_url;
      //       }
      //     }
      //   });
      // },
      // getDataUser(self) {
      //   self.$api.getCurrentTeamMembers({cache: true}).then(tagItems => {
      //     tagItems.forEach((item, index) => {
      //       item.context = "members";
      //     });
      //     Object.assign(self.targets, tagItems);
      //     self.loaded = true;
      //     self.createSearchbar();
      //   });
      // },
      saveTimesheetShift() {
        const self = this;

        if (self.timesheetId) {
          const timesheetShiftData = {...self.timesheetShift};
          API.createTimesheetShift(timesheetShiftData).then((response) => {
            console.log('createTimesheetShift response', response);
            self.$f7router.back();
            self.$events.$emit("time_sheets:timesheet_shift_created", self.timesheetShift);
          });

        } else {
          const timesheetShiftData = {...self.timesheetShift};
          delete timesheetShiftData.id;
          API.updateTimesheetShift(self.edit_id, timesheetShiftData).then(() => {
            self.$f7router.back();
            self.$events.$emit("time_sheets:timesheet_shift_edited", self.timesheetShift);
          });
        }

      },
      deleteTimesheet() {
        const self = this;
        if (!self.editAccess) return;
        API.deleteTimesheet(self.timesheet.id).then((response) => {
          console.log('deleteTimesheet', response);
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
      },
      // prepareAttendance(data) {
      //   const self = this;
      //   const user = self.$root.teamMembers.filter(
      //     member => member.user_id === data.user_id
      //   );
      //   data.user_name = user[0].first_name + " " + user[0].last_name;
      //   data.icon_url = user[0].icon_url;
      //   return data;
      // },
      // createPhotoPreview() {
      //   const self = this;
      //   self.photoPreview = self.$f7.photoBrowser.create({
      //     photos: [
      //       {
      //         url: self.image_preview
      //       }
      //     ],
      //     theme: "dark",
      //     type: "standalone",
      //     toolbar: false,
      //     backLinkText: "",
      //     swiper: {
      //       initialSlide: 0,
      //       spaceBetween: 20,
      //       speed: 300,
      //       loop: false,
      //       preloadImages: true,
      //       navigation: {},
      //       zoom: {
      //         enabled: true,
      //         maxRatio: 3,
      //         minRatio: 1
      //       },
      //       lazy: {
      //         enabled: false
      //       }
      //     },
      //     renderNavbar() {
      //       let editHtml = "";
      //       if (self.editAccess) {
      //         editHtml = `
      //         <a href="#" class="link icon-only" id="time-clock-reload-photo" ref="reloadPhoto">
      //           <i class="icon f7-icons color-white">reload</i>
      //         </a>
      //       `;
      //       }
      //       const navbarHtml = `
      //       <div class="navbar">
      //         <div class="navbar-inner sliding">
      //           <div class="left">
      //             <a href="#" class="link popup-close icon-only" data-popup=".photo-browser-popup">
      //               <i class="icon icon-back color-white"></i>
      //             </a>
      //           </div>
      //           <div class="right">${editHtml}</div>
      //         </div>
      //       </div>
      //     `.trim();
      //       return navbarHtml;
      //     },
      //     on: {
      //       open: () => {
      //         self.$f7
      //           .$("#time-clock-reload-photo")
      //           .on("click", self.reloadPhoto);
      //       },
      //       close: () => {
      //         self.$f7.$("#time-clock-reload-photo").off("click");
      //       }
      //     }
      //   });
      // },
      // reloadPhoto() {
      //   const self = this;
      //   self.$refs.photo.takePhotoAsync().then(photo => {
      //     self.image_preview = photo;
      //     self.photoPreview.swiper.removeSlide(0);
      //     self.photoPreview.swiper.appendSlide(
      //       `<div class="photo-browser-slide swiper-slide swiper-slide-active" data-swiper-slide-index="0"><span class="swiper-zoom-container"><img src="${photo}" ></span></div>`
      //     );
      //     self.photoPreview.params.photos = [
      //       {
      //         url: photo
      //       }
      //     ];
      //   });
      // },
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
      // openTimePickerDetail() {
      //   const self = this;
      //   if (self.editAccess) self.openTimePicker();
      // },

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

      showDeleteButton() {
        const self = this;
        return self.loaded && +self.edit_id > 0;
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
          API.getTimesheetsShifts().then(timesheetsShifts => {
            self.timesheetsShiftsData = timesheetsShifts;
            self.loaded = true;
            self.editAccess = true;

            self.timesheetShift = self.timesheetsShiftsData.find(timesheetShift => +timesheetShift.id === +self.edit_id);
            self.timesheetShiftOriginal = {...self.timesheetShift};

            self.$nextTick(() => {
              self.createCalendar();
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
          };
          self.timesheetShiftOriginal = {...self.timesheetShift};
          self.$nextTick(() => {
            self.createCalendar();
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
