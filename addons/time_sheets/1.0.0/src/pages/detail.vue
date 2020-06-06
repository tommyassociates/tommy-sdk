<template>
  <f7-page
    class="time-sheet-detail-page"
    @page:beforeremove="onPageBeforeRemove"
    @page:beforeout="onPageBeforeOut"
  >
    <template v-if="isTeamMember">
      <f7-navbar>
        <tommy-nav-back></tommy-nav-back>
        <f7-nav-title>{{$t('time_sheets.timesheet_details.title')}}</f7-nav-title>
        <f7-nav-right class="whs-navbar-links">
          <f7-link icon-only @click="createTimesheetShift()">
            <f7-icon f7="add"/>
          </f7-link>
        </f7-nav-right>
      </f7-navbar>
      <f7-toolbar v-if="loaded && canEditTimesheetShifts">
        <f7-button @click="deleteClick()" class="button button--red-text">
          {{$t('time_sheets.timesheet_details.delete_button')}}
        </f7-button>
        <f7-button @click="submitForApprovalClick()" :class="submitForApprovalButtonClasses">
          {{$t('time_sheets.timesheet_details.submit_for_approval_button')}}
        </f7-button>
      </f7-toolbar>
      <template v-if="loaded">
        <f7-list media-list>
          <f7-list-item
            :title="$t('time_sheets.timesheet_details.id_label')"
          >
            <div slot="after">
              {{timesheet.id}}
            </div>
          </f7-list-item>

          <f7-list-item
            :title="$t('time_sheets.timesheet_details.date_label')"
          >
            <div slot="after">
              {{ dateRangeFormat(timesheet.start_date, timesheet.end_date) }}
            </div>
          </f7-list-item>

          <f7-list-item
            :title="$t('time_sheets.timesheet_details.status_label')"
          >
            <div slot="after">
              {{timesheet.status}}
            </div>
          </f7-list-item>

          <f7-list-item
            :title="$t('time_sheets.timesheet_details.hours_label')"
          >
            <div slot="after">
              {{ hoursTotal }}
            </div>
          </f7-list-item>
        </f7-list>

        <f7-block-title class="time-clock-divider">{{ $t('time_sheets.timesheet_details.items_title') }}
        </f7-block-title>

        <template v-if="timesheetShifts.length">
          <f7-list media-list class="time-sheet-list">
            <template v-if="canEditTimesheetShifts">
              <f7-list-item
                swipeout
                v-for="(timesheetShift, index) in timesheetShifts"
                :key="'timesheetShift_'+index"
                :title="timesheetShift.title"
                :subtitle="`${timesheetShift.description ? timesheetShift.description : ''}`"
                :link="'/time-sheets/item-detail/' + timesheetShift.id"
                @swipeout:deleted="onSwipeoutDeleted(timesheetShift)"
              >
                <div slot="media">
                  <hours-minutes-badge :hours="String(timesheetShift.hours)"
                                       :minutes="String(timesheetShift.minutes)"></hours-minutes-badge>
                </div>

                <f7-swipeout-actions right>
                  <f7-swipeout-button close @click="copyTimesheetShift(timesheetShift.id)">Copy</f7-swipeout-button>
                  <f7-swipeout-button delete>Delete</f7-swipeout-button>
                </f7-swipeout-actions>
              </f7-list-item>
            </template>
            <template v-if="!canEditTimesheetShifts">
              <f7-list-item
                v-for="(timesheetShift, index) in timesheetShifts"
                :key="'timesheetShift_'+index"
                :title="timesheetShift.title"
                :subtitle="`${timesheetShift.description ? timesheetShift.description : ''}`"
                :link="'/time-sheets/item-detail/' + timesheetShift.id"
              >
                <div slot="media">
                  <hours-minutes-badge :hours="String(timesheetShift.hours)"
                                       :minutes="String(timesheetShift.minutes)"></hours-minutes-badge>
                </div>
              </f7-list-item>
            </template>
          </f7-list>
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

      <f7-sheet class="time-clock-action-sheet" ref="actionSheet">
        <f7-toolbar>
          <div class="left">
            <f7-link
              sheet-close
              class="cancel"
              @click="clearAction"
            >{{$t('time_sheets.event_details.cancel_button')}}
            </f7-link>
          </div>
          <div class="right">
            <f7-link sheet-close @click="setAction">{{$t('time_sheets.event_details.done_button')}}</f7-link>
          </div>
        </f7-toolbar>
        <f7-page-content>

        </f7-page-content>
      </f7-sheet>
    </template>

  </f7-page>
</template>
<script>
  import API from "../api";
  import addonAssetsUrl from '../utils/addon-assets-url';
  import dialog from "../mixins/dialog.vue";
  import timePicker from "../mixins/time-picker.vue";
  import hoursMinutesBadge from '../components/hours-minutes-badge.vue';
  import TimesheetService from "../services/timesheet-service";

  export default {
    name: "TimesheetDetail",
    mixins: [dialog, timePicker],
    components: {
      hoursMinutesBadge
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
      submitForApprovalClick() {
        const self = this;
        // if (self.editAccess) return;
        const data = {
          status: 'submitted'
        };
        API.updateTimesheet(self.edit_id, data).then(response => {
          self.$events.$emit("time_sheets:timesheet_shift_edited");
        });
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

      copyTimesheetShift(timesheetShiftId) {
        const self = this;
        console.log(timesheetShiftId);
        const timesheetShift = self.timesheetsShiftsData.find(timesheetShift => +timesheetShift.id === +timesheetShiftId);
        delete timesheetShift.id;
        API.createTimesheetShift(timesheetShift).then(response => {
          console.log(response);
          self.timesheetsShiftsData.push(response);

          self.$events.$emit("time_sheets:timesheet_shift_created", response);
        });
      },

      createTimesheetShift() {
        console.log('createTimesheetShift');
        const self = this;
        const url = `/time-sheets/item-detail/create/${self.edit_id}`;
        self.$f7router.navigate(url);
      },


      changeAction(val) {
        const self = this;
        self.detail_data.status = val;
      },
      setAction() {
        const self = this;
        if (self.new_action !== null)
          self.detail_data.event = String(self.new_action);
      },
      clearAction() {
        const self = this;
        self.new_action = null;
      },
      getPhotoCamera(photo) {
        const self = this;
      },
      openMapPage() {
        const self = this;
        const url = `https://www.google.com/maps/place/${self.detail_data.latitude}+${self.detail_data.longitude}`;

        window.open(url, '_system', 'location=yes,hidden=yes,beforeload=yes');

        // self.$f7router.navigate("/time-clock/map/", {
        //   props: {
        //     edit: self.edit_acces,
        //     latitude: self.detail_data.latitude,
        //     longitude: self.detail_data.longitude,
        //     accuracy: self.detail_data.accuracy,
        //     address: self.detail_data.address,
        //     callback: self.editCoordinates
        //   }
        // });
      },
      editCoordinates(latitude, longitude, accuracy, address) {
        const self = this;
        self.detail_data.latitude = latitude;
        self.detail_data.longitude = longitude;
        self.detail_data.accuracy = accuracy;
        self.detail_data.address = address;
      },
      openPhoto() {
        const self = this;
        self.$refs.actionSheet.close();
        self.photoPreview.open();
      },
      openSelector() {
        const self = this;
        if (!self.editAccess) return;
        self.$f7router.navigate("/time-clock/select-picker/", {
          props: {
            selected: self.detail_data.user_id,
            pageTitle: self.$t("time_sheets.event_details.who_label"),
            multiply: false,
            getData: self.getDataUser,
            type: "team",
            saveChange(user) {
              self.detail_data.user_id = user.user_id;
              self.detail_data.user_name = user.first_name + " " + user.last_name;
              self.detail_data.icon_url = user.icon_url;
            }
          }
        });
      },
      getDataUser(self) {
        self.$api.getCurrentTeamMembers({cache: true}).then(tagItems => {
          tagItems.forEach((item, index) => {
            item.context = "members";
          });
          Object.assign(self.targets, tagItems);
          self.loaded = true;
          self.createSearchbar();
        });
      },
      editAttendance() {
        const self = this;
        if (!self.editAccess) return;
        const form = new FormData();

        if (
          self.detail_data.status === "pause" ||
          self.detail_data.status === "resume"
        ) {
          form.append("image", null);
        } else {
          form.append(
            "image",
            self.dataURLToBlob(self.image_preview),
            `attendance_${self.detail_data.id}.jpg`
          );
        }

        form.append("address", self.detail_data.address);
        form.append("latitude", self.detail_data.latitude);
        form.append("longitude", self.detail_data.longitude);
        form.append("accuracy", self.detail_data.accuracy);
        form.append("event_id", self.detail_data.event_id);
        form.append("status", self.detail_data.status);
        form.append("team_id", self.detail_data.team_id);
        form.append("user_id", self.detail_data.user_id);
        form.append("timestamp", self.detail_data.timestamp);

        API.editAttendance(self.detail_data.id, form).then(() => {
          self.$f7router.back();
          self.$events.$emit("time_sheets:attedance_edit", self.detail_data);
        });
      },

      openCalendar() {
        const self = this;
        if (self.editAccess) self.calendarInstance.open();
      },
      createCalendar() {
        const self = this;
        let date = new Date(self.detail_data.timestamp);
        self.calendarInstance = self.$f7.calendar.create({
          value: [date],
          openIn: "customModal",
          backdrop: true,
          closeOnSelect: true,
          on: {
            change(cal, val) {
              const date = new Date(self.detail_data.timestamp);
              const date_new = new Date(val[0]);
              date.setFullYear(date_new.getFullYear());
              date.setMonth(date_new.getMonth());
              date.setDate(date_new.getDate());
              self.detail_data.timestamp = date.toISOString();
            }
          }
        });
      },
      onPageBeforeOut() {
        const self = this;
        self.$refs.actionSheet.close();
      },
      onPageBeforeRemove() {
        const self = this;
        self.$refs.actionSheet.$destroy();
        if (self.calendarInstance) self.calendarInstance.destroy();
      },
      prepareAttendance(data) {
        const self = this;
        const user = self.$root.teamMembers.filter(
          member => member.user_id === data.user_id
        );
        data.user_name = user[0].first_name + " " + user[0].last_name;
        data.icon_url = user[0].icon_url;
        return data;
      },
      createPhotoPreview() {
        const self = this;
        self.photoPreview = self.$f7.photoBrowser.create({
          photos: [
            {
              url: self.image_preview
            }
          ],
          theme: "dark",
          type: "standalone",
          toolbar: false,
          backLinkText: "",
          swiper: {
            initialSlide: 0,
            spaceBetween: 20,
            speed: 300,
            loop: false,
            preloadImages: true,
            navigation: {},
            zoom: {
              enabled: true,
              maxRatio: 3,
              minRatio: 1
            },
            lazy: {
              enabled: false
            }
          },
          renderNavbar() {
            let editHtml = "";
            if (self.editAccess) {
              editHtml = `
              <a href="#" class="link icon-only" id="time-clock-reload-photo" ref="reloadPhoto">
                <i class="icon f7-icons color-white">reload</i>
              </a>
            `;
            }
            const navbarHtml = `
            <div class="navbar">
              <div class="navbar-inner sliding">
                <div class="left">
                  <a href="#" class="link popup-close icon-only" data-popup=".photo-browser-popup">
                    <i class="icon icon-back color-white"></i>
                  </a>
                </div>
                <div class="right">${editHtml}</div>
              </div>
            </div>
          `.trim();
            return navbarHtml;
          },
          on: {
            open: () => {
              self.$f7
                .$("#time-clock-reload-photo")
                .on("click", self.reloadPhoto);
            },
            close: () => {
              self.$f7.$("#time-clock-reload-photo").off("click");
            }
          }
        });
      },
      reloadPhoto() {
        const self = this;
        self.$refs.photo.takePhotoAsync().then(photo => {
          self.image_preview = photo;
          self.photoPreview.swiper.removeSlide(0);
          self.photoPreview.swiper.appendSlide(
            `<div class="photo-browser-slide swiper-slide swiper-slide-active" data-swiper-slide-index="0"><span class="swiper-zoom-container"><img src="${photo}" ></span></div>`
          );
          self.photoPreview.params.photos = [
            {
              url: photo
            }
          ];
        });
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
      openTimePickerDetail() {
        const self = this;
        if (self.editAccess) self.openTimePicker();
      },

      updateAll() {
        const self = this;
        API.getTimesheets(false).then(timesheets => {
          self.timesheetsData = timesheets;
          API.getTimesheetsShifts(false).then(timesheetsShifts => {
            self.timesheetsShiftsData = timesheetsShifts;
            self.loaded = true;

            //self.editAccess = false;


          });
        });
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

      timesheet() {
        const self = this;
        return self.timesheetsData.find(timesheet => +timesheet.id === +self.edit_id);
      },

      timesheetShifts() {
        const self = this;
        const timesheetShifts = self.timesheetsShiftsData.filter(timesheetShift => +timesheetShift.timesheet_id === +self.edit_id);
        return TimesheetService.formatTimesheetsShiftsData(timesheetShifts, self);
      },

      submitForApprovalButtonClasses() {
        const self = this;
        return {
          'button': true,
          'button--red': true,
          'disabled': self.timesheet.status === 'submitted',
        }
      },

      isTeamMember() {
        const self = this;
        return self.$root.account.roles.includes('Team Member');
      },

      isTeamManager() {
        const self = this;
        return self.$root.account.roles.includes('Team Manager');
      },

      canEditTimesheetShifts() {
        const self = this;
        return self.timesheet.status === 'unsubmitted';
      },


    },
    beforeDestroy() {
      const self = this;

      self.$events.$off("time_sheets:timesheet_shift_edited", self.updateAll);
      self.$events.$off("time_sheets:timesheet_shift_created", self.updateAll);
      self.$events.$off("time_sheets:timesheet_shift_deleted", self.updateAll);

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

      self.$events.$on("time_sheets:timesheet_shift_edited", self.updateAll);
      self.$events.$on("time_sheets:timesheet_shift_created", self.updateAll);
      self.$events.$on("time_sheets:timesheet_shift_deleted", self.updateAll);
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

        edit_id: self.$f7route.params.id,
        editAccess: false,
        timesheetsData: [],
        timesheetsShiftsData: [],
        loaded: false,
      };
    }
  };
</script>
