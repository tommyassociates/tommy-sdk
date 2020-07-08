<template>
  <f7-page
    class="time-sheet-detail-page"
    @page:beforeremove="onPageBeforeRemove"
    @page:beforeout="onPageBeforeOut"
  >
    <template v-if="isTeamManager">
      <f7-navbar>
        <tommy-nav-back></tommy-nav-back>
        <f7-nav-title>{{$t('time_sheets.timesheet_details.title')}}</f7-nav-title>
        <f7-nav-right class="whs-navbar-links">
          <f7-link icon-only :href="`/time-sheets/manager/time-sheets/attendance-detail/create/${edit_id}`"
                   v-if="permissions.canCreate">
            <f7-icon f7="add"/>
          </f7-link>
        </f7-nav-right>
      </f7-navbar>
      <f7-toolbar v-if="loaded">
        <f7-button @click="deleteClick()" class="button button--red-text">
          {{$t('time_sheets.timesheet_details.delete_button')}}
        </f7-button>
      </f7-toolbar>
      <template v-if="loaded && permissions.canEdit">
        <f7-list media-list>
          <f7-list-item
            :title="$t('time_sheets.timesheet_details.date_label')"
          >
            <div slot="after">
              {{ dateRangeFormat(managerTimesheet.start_date, managerTimesheet.end_date) }}
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

        <f7-block-title class="time-clock-divider">{{ $t('time_sheets.timesheet_details_attendance.timeline_title') }}
        </f7-block-title>

        <template v-if="managerAttendances.length">
          <f7-list media-list class="attendance-list">

            <f7-list-item
              swipeout
              v-for="(managerAttendance, index) in managerAttendances"
              :key="'managerAttendance_'+index"
              :after="managerAttendance.startTime"
              :link="'/time-sheets/manager/time-sheets/attendance-detail/' + managerAttendance.id"
              @swipeout:deleted="onSwipeoutDeleted(managerAttendance)"
            >
              <div slot="media" style="color:#999">
                <play-icon v-if="managerAttendance.status === 'start'"></play-icon>
                <pause-icon v-if="managerAttendance.status === 'pause'"></pause-icon>
                <resume-icon v-if="managerAttendance.status === 'resume'"></resume-icon>
                <stop-icon v-if="managerAttendance.status === 'stop'"></stop-icon>
              </div>

              <div slot="title">
                <div class="item-title__container">
                  <div class="item-title__title">{{ managerAttendance.status }}</div>
                  <div class="item-title__images-container">
                    <div class="item-title__image-icon">
                      <ImageIcon v-if="managerAttendance.image !== null"></ImageIcon>
                    </div>
                    <div class="item-title__location-icon">
                      <LocationIcon v-if="managerAttendance.latitude !== null && managerAttendance.longitude !== null"></LocationIcon>
                    </div>
                  </div>
                </div>
              </div>

              <div slot="after-end" class="item-after--after-end">{{ managerAttendance.attendanceDate }}</div>


              <f7-swipeout-actions right>
                <f7-swipeout-button close @click="editManagerTimesheetShift(managerAttendance.id)">
                  {{ $t('time_sheets.timesheet_details.edit_button') }}
                </f7-swipeout-button>
                <f7-swipeout-button delete>{{ $t('time_sheets.timesheet_details.delete_button') }}</f7-swipeout-button>
              </f7-swipeout-actions>
            </f7-list-item>

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


    </template>

  </f7-page>
</template>
<script>
  import API from "../../api";
  import addonAssetsUrl from '../../utils/addon-assets-url';
  import dialog from "../../mixins/dialog.vue";
  import timePicker from "../../mixins/time-picker.vue";
  import hoursMinutesBadge from '../../components/hours-minutes-badge.vue';
  import TimesheetService from "../../services/timesheet-service";

  import PlayIcon from "../../components/icons/play-icon";
  import PauseIcon from "../../components/icons/pause-icon";
  import ResumeIcon from "../../components/icons/resume-icon";
  import StopIcon from "../../components/icons/stop-icon";
  import ImageIcon from '../../components/icons/image-icon';
  import LocationIcon from '../../components/icons/location-icon';

  export default {
    name: "TimesheetsManagerDetail",
    mixins: [dialog, timePicker],
    components: {
      StopIcon,
      ResumeIcon,
      PauseIcon,
      PlayIcon,
      ImageIcon,
      LocationIcon,
      hoursMinutesBadge
    },
    methods: {
      addonAssetsUrl,
      deleteManagerTimesheet() {
        const self = this;
        // if (!self.editAccess) return;
        API.deleteManagerTimesheet(self.managerTimesheet.id, false).then((response) => {
          console.log('deleteTimesheet', response);
          self.$f7router.back();
          self.$events.$emit("time_sheets:timesheet_deleted", self.managerTimesheet);
        });
      },
      deleteClick() {
        const self = this;
        self.confirmDialog(
          false,
          self.$t("time_sheets.timesheet_details.delete_text"),
          self.$t("time_sheets.timesheet_details.confirm_button"),
          self.$t("time_sheets.timesheet_details.cancel_button"),
          self.deleteManagerTimesheet,
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

      onSwipeoutDeleted(managerAttendance) {
        const self = this;
        const managerAttendanceId = managerAttendance.id;

        API.deleteAttendance(managerAttendanceId).then(response => {
          console.log('deleteManagerAttendance', response);
          self.$events.$emit("time_sheets:timesheet_attendance_deleted");
        });
      },

      editManagerTimesheetShift(managerTimesheetId) {
        const self = this;
        const url = `/time-sheets/manager/time-sheets/attendance-detail/${managerTimesheetId}`;
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
      },
      onPageBeforeRemove() {
        const self = this;
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
        const otherOptions = {
          timesheet_id: self.edit_id,
        };
        API.getManagerTimesheets({otherOptions}).then(managerTimesheets => {
          self.managerTimesheetsData = managerTimesheets;

          const otherOptions = {
            timesheet_id: self.edit_id,
            limit: 200,
          };
          API.getManagerTimesheetsShifts({otherOptions}).then(managerTimesheetsShifts => {
            self.managerTimesheetsShiftsData = managerTimesheetsShifts;


            //self.editAccess = false;
            console.log(self.managerTimesheet.start_date);
            console.log(self.managerTimesheet.end_date);
            const startDate = self.$moment(self.managerTimesheet.start_date).valueOf();
            const endDate = self.$moment(self.managerTimesheet.end_date).valueOf();

            //TODO Get date range from endpoint.
            const otherOptions = {
              // date_range: '159093360,159343920',
              // date_range: `2020-05-01,2020-05-31`,
              timesheet_item_id: self.edit_id,
              limit: 200,
            };
            API.getManagerAttendances({otherOptions}).then(managerAttendances => {
              self.managerAttendancesData = managerAttendances;
              self.loaded = true;
            });


          });
        });

        // tommy.api
        //   .call({
        //     endpoint: "/workforce/manager/attendances/86",
        //     method: "GET",
        //     cache: false,
        //   })
        //   .then(data => {
        //     console.table(data);
        //     return data;
        //   });
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
        const managerTimesheetShifts = self.managerTimesheetShifts;
        const hours = managerTimesheetShifts.reduce((totalHours, managerTimesheetShift) => Math.trunc(totalHours) + Math.trunc(managerTimesheetShift.work_hours), 0);
        return parseFloat(hours).toFixed(2);
      },

      managerTimesheet() {
        const self = this;
        return self.managerTimesheetsData.find(managerTimesheet => +managerTimesheet.id === +self.edit_id);
      },

      managerTimesheetShifts() {
        const self = this;
        const managerTimesheetShifts = self.managerTimesheetsShiftsData.filter(managerTimesheetShift => +managerTimesheetShift.timesheet_id === +self.edit_id);
        return TimesheetService.formatTimesheetsShiftsData(managerTimesheetShifts, self);
      },

      managerAttendances() {
        const self = this;
        return TimesheetService.formattedManagerAttendancesData(self.managerAttendancesData, self.managerTimesheet.start_date, self.managerTimesheet.end_date, self);
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
        return self.managerTimesheet.status === 'unsubmitted';
      },


    },
    beforeDestroy() {
      const self = this;

      self.$events.$off("time_sheets:timesheet_shift_edited", self.updateAll);
      self.$events.$off("time_sheets:timesheet_shift_created", self.updateAll);
      self.$events.$off("time_sheets:timesheet_shift_deleted", self.updateAll);

      self.$events.$off("time_sheets:attendance_edited", self.updateAll);
      self.$events.$off("time_sheets:attendance_created", self.updateAll);
      self.$events.$off("time_sheets:attendance_deleted", self.updateAll);

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

      return Promise.all([


        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "attendance_create_access",
          {with_filters: true}
        ),

        self.$api.getInstalledAddonPermission(
          "time_sheets",
          "attendance_edit_access",
          {with_filters: true}
        ),


      ]).then(permissions => {

        const canEditPermission = permissions.find(permission => permission.name === 'attendance_edit_access');
        const canCreatePermission = permissions.find(permission => permission.name === 'attendance_create_access');
        self.permissions.canEdit = API.checkPermission(canEditPermission);
        self.permissions.canCreate = API.checkPermission(canCreatePermission);

        self.updateAll();
      });


    },
    created() {
      const self = this;

      self.$events.$on("time_sheets:timesheet_shift_edited", self.updateAll);
      self.$events.$on("time_sheets:timesheet_shift_created", self.updateAll);
      self.$events.$on("time_sheets:timesheet_shift_deleted", self.updateAll);

      self.$events.$on("time_sheets:attendance_edited", self.updateAll);
      self.$events.$on("time_sheets:attendance_created", self.updateAll);
      self.$events.$on("time_sheets:attendance_deleted", self.updateAll);
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
        managerTimesheetsData: [],
        managerTimesheetsShiftsData: [],
        managerAttendancesData: [],
        loaded: false,

        permissions: {
          canCreate: false,
          canEdit: false,
        },
      };
    }
  };
</script>
