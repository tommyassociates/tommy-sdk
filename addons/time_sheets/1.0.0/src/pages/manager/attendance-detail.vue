<template>
  <f7-page
    class="time-clock-detail-page"
    @page:beforeremove="onPageBeforeRemove"
    @page:beforeout="onPageBeforeOut"
  >
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_sheets.timesheet_attendance_detail.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="editAttendance" v-if="edit_acces">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-toolbar v-if="edit_acces">
      <f7-button @click="deleteClick()">{{$t('time_sheets.timesheet_attendance_detail.delete_button')}}</f7-button>
    </f7-toolbar>
    <f7-list media-list v-if="loaded">
      <f7-list-item
        :title="$t('time_sheets.timesheet_attendance_detail.time_label')"
        :link="edit_acces"
        @click.native="openTimePickerDetail()"
      >
        <div slot="after">
          <input type="text" id="timePicker" readonly :value="timeField" />
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_sheets.timesheet_attendance_detail.date_label')"
        :link="edit_acces"
        @click.native="openCalendar()"
        :after="dateField"
      ></f7-list-item>
      <f7-list-item
        :title="$t('time_sheets.timesheet_attendance_detail.who_label')"
        :link="edit_acces"
        @click.native="openSelector()"
      >
        <div slot="after" class="after-container">
          <div class="name">{{detail_data.user_name}}</div>
          <div class="image" :style="{backgroundImage : 'url('+detail_data.icon_url+')'}"></div>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_sheets.timesheet_attendance_detail.where_label')"
        :link="true"
        :after="detail_data.address"
        @click.native="openMapPage"
      ></f7-list-item>
      <f7-list-item
        :title="$t('time_sheets.timesheet_attendance_detail.photo_label')"
        :link="true"
        @click.native="openPhoto()"
        v-if="detail_data.status === 'start' || detail_data.status === 'stop'"
      >
        <div slot="after" class="after-container">
          <div class="image" :style="{backgroundImage : 'url('+image_preview+')'}"></div>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_sheets.timesheet_attendance_detail.action_label')"
        :link="edit_acces"
        sheet-open=".time-clock-action-sheet"
        :after="$t('time_clock.index.clock_event_options.'+detail_data.status)"
        @click="sheet_action_opened = true"
      ></f7-list-item>
    </f7-list>

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
          >{{$t('time_sheets.timesheet_attendance_detail.cancel_button')}}</f7-link>
        </div>
        <div class="right">
          <f7-link sheet-close @click="setAction">{{$t('time_sheets.timesheet_attendance_detail.done_button')}}</f7-link>
        </div>
      </f7-toolbar>
      <f7-page-content>
        <f7-list v-if="edit_acces && loaded">
          <f7-list-item
            radio
            :checked="detail_data.status === 'start'"
            :title="$t('time_sheets.timesheet_attendance_detail.clock_event_options.start')"
            name="time-clock-detail-action"
            @change="changeAction('start')"
            value="start"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'stop'"
            :title="$t('time_sheets.timesheet_attendance_detail.clock_event_options.stop')"
            name="time-clock-detail-action"
            @change="changeAction('stop')"
            value="stop"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'pause'"
            :title="$t('time_sheets.timesheet_attendance_detail.clock_event_options.pause')"
            name="time-clock-detail-action"
            @change="changeAction('pause')"
            value="pause"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'resume'"
            :title="$t('time_sheets.timesheet_attendance_detail.clock_event_options.resume')"
            name="time-clock-detail-action"
            @change="changeAction('resume')"
            value="resume"
          />
        </f7-list>
      </f7-page-content>
    </f7-sheet>
    <Photo ref="photo" direction="front" v-if="edit_acces" />
  </f7-page>
</template>
<script>
  import API from "../../api";
  import dialog from "../../mixins/dialog.vue";
  import timePicker from "../../mixins/time-picker.vue";
  import Blob from "../../mixins/baseToBlob.vue";
  import Photo from '../../components/photo.vue';
  export default {
    name: "TimesheetsManagerAttendanceDetail",
    mixins: [dialog, timePicker, Blob],
    components: { Photo },
    methods: {
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
        if (!self.edit_acces) return;
        self.$f7router.navigate("/time-clock/select-picker/", {
          props: {
            selected: self.detail_data.user_id,
            pageTitle: self.$t("time_clock.event_details.who_label"),
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
        self.$api.getCurrentTeamMembers({ cache: true }).then(tagItems => {
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
        if (!self.edit_acces) return;
        const form = new FormData();

        if (self.$f7route.params.managerTimesheetId) {
          form.append('timesheet_shift_id', self.$f7route.params.managerTimesheetId);
        }

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
          if (self.$f7route.params.managerTimesheetId) {
            self.$events.$emit("time_sheets:attendance_created", self.detail_data);
          } else {
            self.$events.$emit("time_sheets:attendance_edited", self.detail_data);
          }
        });
      },
      deleteAttendance() {
        const self = this;
        if (!self.edit_acces) return;
        API.deleteAttendance(self.detail_data.id).then(() => {
          self.$f7router.back();
          self.$events.$emit("time_clock:attedance_delete", self.detail_data);
        });
      },
      deleteClick() {
        const self = this;
        self.confirmDialog(
          false,
          self.$t("time_clock.event_details.delete_text"),
          self.$t("time_clock.event_details.confirm_button"),
          self.$t("time_clock.event_details.cancel_button"),
          self.deleteAttendance,
          false,
          null,
          true,
          false
        );
      },
      openCalendar() {
        const self = this;
        if (self.edit_acces) self.calendarInstance.open();
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
            if (self.edit_acces) {
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
        if (self.edit_acces) self.openTimePicker();
      }
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
      }
    },
    mounted() {
      const self = this;
      self.$api
        .getInstalledAddonPermission("time_clock", "attendance_edit_access", {
          with_filters: true
        })
        .then(v => {
          self.edit_acces = self.checkPermision(v);

          API.getAttendancesDetail(self.edit_id).then(data => {
            self.detail_data = self.prepareAttendance(data);
            if (typeof self.detail_data.image !== "undefined")
              self.image_preview = self.detail_data.image.url;
            self.loaded = true;
            if (self.edit_acces) {
              self.$nextTick(() => {
                self.createCalendar();
                self.createTimePicker(self.detail_data.timestamp);
                self.createPhotoPreview();
              });
            } else {
              self.$nextTick(() => {
                self.createPhotoPreview();
              });
            }
          });
        });
    },
    created() {
      const self = this;
    },
    data() {
      const self = this;
      return {
        image_preview: null,
        sheet_action_opened: false,
        new_action: null,
        edit_id: self.$f7route.params.attendanceId,
        edit_acces: false,
        detail_data: null,
        loaded: false
      };
    }
  };
</script>
