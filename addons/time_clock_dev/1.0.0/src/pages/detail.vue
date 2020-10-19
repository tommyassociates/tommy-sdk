<template>
  <f7-page
    class="time-clock-detail-page"
    @page:beforeremove="onPageBeforeRemove"
    @page:beforeout="onPageBeforeOut"
  >
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{ $t(`${addonConfig.package}.event_details.title`) }}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="editAttendance" v-if="edit_acces">
          <f7-icon f7="check"/>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-toolbar v-if="edit_acces">
      <f7-button @click="deleteClick()">{{ $t(`${addonConfig.package}.event_details.delete_button`) }}</f7-button>
    </f7-toolbar>
    <f7-list media-list v-if="loaded">
      <f7-list-item
        :title="$t(`${addonConfig.package}.event_details.time_label`)"
        :link="edit_acces"
        @click.native="openTimePickerDetail()"
      >
        <div slot="after">
          <input type="text" id="timePicker" readonly :value="timeField"/>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t(`${addonConfig.package}.event_details.date_label`)"
        :link="edit_acces"
        @click.native="openCalendar()"
        :after="dateField"
      ></f7-list-item>
      <f7-list-item
        :title="$t(`${addonConfig.package}.event_details.who_label`)"
        :link="edit_acces"
        @click.native="openSelector()"
      >
        <div slot="after" class="after-container">
          <div class="name">{{ detail_data.user_name }}</div>
          <div class="image" :style="{backgroundImage : 'url('+detail_data.icon_url+')'}"></div>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t(`${addonConfig.package}.event_details.where_label`)"
        :link="true"
        :after="detail_data.address"
        @click.native="openMapPage"
      ></f7-list-item>
      <f7-list-item
        :title="$t(`${addonConfig.package}.event_details.photo_label`)"
        :link="true"
        @click.native="openPhoto()"
        v-if="detail_data.status === 'start' || detail_data.status === 'stop'"
      >
        <div slot="after" class="after-container">
          <div class="image" :style="{backgroundImage : 'url('+image_preview+')'}"></div>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t(`${addonConfig.package}.event_details.action_label`)"
        :link="edit_acces"
        sheet-open=".time-clock-action-sheet"
        :after="$t(`${addonConfig.package}.index.clock_event_options.${detail_data.status}`)"
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
          >{{ $t(`${addonConfig.package}.event_details.cancel_button`) }}
          </f7-link>
        </div>
        <div class="right">
          <f7-link sheet-close @click="setAction">{{ $t(`${addonConfig.package}.event_details.done_button`) }}</f7-link>
        </div>
      </f7-toolbar>
      <f7-page-content>
        <f7-list v-if="edit_acces && loaded">
          <f7-list-item
            radio
            :checked="detail_data.status === 'start'"
            :title="$t(`${addonConfig.package}.index.clock_event_options.start`)"
            name="time-clock-detail-action"
            @change="changeAction('start')"
            value="start"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'stop'"
            :title="$t(`${addonConfig.package}.index.clock_event_options.stop`)"
            name="time-clock-detail-action"
            @change="changeAction('stop')"
            value="stop"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'pause'"
            :title="$t(`${addonConfig.package}.index.clock_event_options.pause`)"
            name="time-clock-detail-action"
            @change="changeAction('pause')"
            value="pause"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'resume'"
            :title="$t(`${addonConfig.package}.index.clock_event_options.resume`)"
            name="time-clock-detail-action"
            @change="changeAction('resume')"
            value="resume"
          />
        </f7-list>
      </f7-page-content>
    </f7-sheet>
    <Photo ref="photo" direction="front" v-if="edit_acces"/>
  </f7-page>
</template>
<script>
import addonConfig from "../addonConfig";
import API from "../api";
import dialog from "../mixins/dialog.vue";
import timePicker from "../mixins/time-picker.vue";
import Blob from "../mixins/baseToBlob.vue";
import Photo from '../components/photo.vue';

export default {
  name: "DetailActivity",
  mixins: [dialog, timePicker, Blob],
  components: {Photo},
  methods: {
    changeAction(val) {
      this.detail_data.status = val;
    },
    setAction() {
      if (this.new_action !== null)
        this.detail_data.event = String(this.new_action);
    },
    clearAction() {
      this.new_action = null;
    },
    getPhotoCamera(photo) {

    },
    openMapPage() {
      const url = `https://www.google.com/maps/place/${this.detail_data.latitude}+${this.detail_data.longitude}`;
      window.open(url, '_system', 'location=yes,hidden=yes,beforeload=yes');
    },
    editCoordinates(latitude, longitude, accuracy, address) {
      this.detail_data.latitude = latitude;
      this.detail_data.longitude = longitude;
      this.detail_data.accuracy = accuracy;
      this.detail_data.address = address;
    },
    openPhoto() {
      this.$refs.actionSheet.close();
      this.photoPreview.open();
    },
    openSelector() {
      if (!this.edit_acces) return;
      this.$f7router.navigate("/time-clock/select-picker/", {
        props: {
          selected: this.detail_data.user_id,
          pageTitle: this.$t(`${addonConfig.package}.event_details.who_label`),
          multiply: false,
          getData: this.getDataUser,
          type: "team",
          saveChange(user) {
            this.detail_data.user_id = user.user_id;
            this.detail_data.user_name = user.first_name + " " + user.last_name;
            this.detail_data.icon_url = user.icon_url;
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
      if (!this.edit_acces) return;
      const form = new FormData();

      if (
        this.detail_data.status === "pause" ||
        this.detail_data.status === "resume"
      ) {
        form.append("image", null);
      } else {
        form.append(
          "image",
          this.dataURLToBlob(this.image_preview),
          `attendance_${this.detail_data.id}.jpg`
        );
      }

      form.append("address", this.detail_data.address);
      form.append("latitude", this.detail_data.latitude);
      form.append("longitude", this.detail_data.longitude);
      form.append("accuracy", this.detail_data.accuracy);
      form.append("event_id", this.detail_data.event_id);
      form.append("status", this.detail_data.status);
      form.append("team_id", this.detail_data.team_id);
      form.append("user_id", this.detail_data.user_id);
      form.append("timestamp", this.detail_data.timestamp);

      API.editAttendance(this.detail_data.id, form).then(() => {
        this.$f7router.back();
        this.$events.$emit(`${addonConfig.package}:attedance_edit`, this.detail_data);
      });
    },
    deleteAttendance() {
      if (!this.edit_acces) return;
      API.deleteAttendance(this.detail_data.id).then(() => {
        this.$f7router.back();
        this.$events.$emit(`${addonConfig.package}:attedance_delete`, this.detail_data);
      });
    },
    deleteClick() {
      this.confirmDialog(
        false,
        this.$t(`${addonConfig.package}.event_details.delete_text`),
        this.$t(`${addonConfig.package}.event_details.confirm_button`),
        this.$t(`${addonConfig.package}.event_details.cancel_button`),
        this.deleteAttendance,
        false,
        null,
        true,
        false
      );
    },
    openCalendar() {
      if (this.edit_acces) this.calendarInstance.open();
    },
    createCalendar() {
      let date = new Date(this.detail_data.timestamp);
      this.calendarInstance = this.$f7.calendar.create({
        value: [date],
        openIn: "customModal",
        backdrop: true,
        closeOnSelect: true,
        on: {
          change: (cal, val) => {
            const date = new Date(this.detail_data.timestamp);
            const date_new = new Date(val[0]);
            date.setFullYear(date_new.getFullYear());
            date.setMonth(date_new.getMonth());
            date.setDate(date_new.getDate());
            this.detail_data.timestamp = date.toISOString();
          }
        }
      });
    },
    onPageBeforeOut() {
      this.$refs.actionSheet.close();
    },
    onPageBeforeRemove() {
      this.$refs.actionSheet.$destroy();
      if (this.calendarInstance) this.calendarInstance.destroy();
    },
    prepareAttendance(data) {
      // const user = this.$store.state.teamMembers.teamMembers.filter(
      //   member => member.user_id === data.user_id
      // );
      const user = this.$root.teamMembers.filter(
        member => member.user_id === data.user_id
      );
      data.user_name = user[0].first_name + " " + user[0].last_name;
      data.icon_url = user[0].icon_url;
      return data;
    },
    createPhotoPreview() {
      this.photoPreview = this.$f7.photoBrowser.create({
        photos: [
          {
            url: this.image_preview
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
          if (this.edit_acces) {
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
            this.$f7
              .$("#time-clock-reload-photo")
              .on("click", this.reloadPhoto);
          },
          close: () => {
            this.$f7.$("#time-clock-reload-photo").off("click");
          }
        }
      });
    },
    reloadPhoto() {
      this.$refs.photo.takePhotoAsync().then(photo => {
        this.image_preview = photo;
        this.photoPreview.swiper.removeSlide(0);
        this.photoPreview.swiper.appendSlide(
          `<div class="photo-browser-slide swiper-slide swiper-slide-active" data-swiper-slide-index="0"><span class="swiper-zoom-container"><img src="${photo}" ></span></div>`
        );
        this.photoPreview.params.photos = [
          {
            url: photo
          }
        ];
      });
    },
    checkPermision(p) {
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
      if (this.edit_acces) this.openTimePicker();
    }
  },
  computed: {
    dateField() {
      if (!this.detail_data) return null;
      return this.$moment(this.detail_data.timestamp).format("DD MMM YYYY");
    },
    timeField() {
      if (!this.detail_data) return null;
      return this.$moment(this.detail_data.timestamp).format("H:mm");
    }
  },
  mounted() {
    this.$api
      .getInstalledAddonPermission(addonConfig.package, "attendance_edit_access", {
        with_filters: true
      })
      .then(v => {
        this.edit_acces = this.checkPermision(v);

        API.getAttendancesDetail(this.edit_id).then(data => {
          this.detail_data = this.prepareAttendance(data);
          if (typeof this.detail_data.image !== "undefined")
            this.image_preview = this.detail_data.image.url;
          this.loaded = true;
          if (this.edit_acces) {
            this.$nextTick(() => {
              this.createCalendar();
              this.createTimePicker(this.detail_data.timestamp);
              this.createPhotoPreview();
            });
          } else {
            this.$nextTick(() => {
              this.createPhotoPreview();
            });
          }
        });
      });
  },
  data() {
    return {
      addonConfig,
      image_preview: null,
      sheet_action_opened: false,
      new_action: null,
      edit_id: this.$f7route.params.id,
      edit_acces: false,
      detail_data: null,
      loaded: false
    };
  }
};
</script>
