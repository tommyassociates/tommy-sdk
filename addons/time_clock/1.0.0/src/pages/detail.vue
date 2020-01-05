<template>
  <f7-page
    class="time-clock-detail-page"
    @page:beforeremove="onPageBeforeRemove"
    @page:beforeout="onPageBeforeOut"
  >
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_clock.event_details.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="editAttendance" v-if="edit_acces">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-toolbar v-if="edit_acces">
      <f7-button @click="deleteClick()">{{$t('time_clock.event_details.delete_button')}}</f7-button>
    </f7-toolbar>
    <f7-list media-list v-if="loaded">
      <f7-list-item
        :title="$t('time_clock.event_details.time_label')"
        :link="edit_acces"
        @click.native="openTimePicker()"
      >
        <div slot="after">
          <input type="text" id="timePicker" readonly />
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.date_label')"
        :link="edit_acces"
        @click.native="openCalendar()"
        :after="dateField"
      ></f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.who_label')"
        :link="edit_acces"
        @click.native="openSelector()"
      >
        <div slot="after" class="after-container">
          <div class="name">{{detail_data.user_name}}</div>
          <div class="image" :style="{backgroundImage : 'url('+detail_data.icon_url+')'}"></div>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.where_label')"
        :link="edit_acces"
        :after="detail_data.address"
        @click.native="openMapPage"
      ></f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.photo_label')"
        :link="edit_acces"
        @click.native="openPhoto()"
        v-if="detail_data.status === 'start' || detail_data.status === 'stop'"
      >
        <div slot="after" class="after-container">
          <div class="image"></div>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.action_label')"
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
          >{{$t('time_clock.event_details.cancel_button')}}</f7-link>
        </div>
        <div class="right">
          <f7-link sheet-close @click="setAction">{{$t('time_clock.event_details.done_button')}}</f7-link>
        </div>
      </f7-toolbar>
      <f7-page-content>
        <f7-list v-if="edit_acces && loaded">
          <f7-list-item
            radio
            :checked="detail_data.status === 'start'"
            :title="$t('time_clock.index.clock_event_options.start')"
            name="time-clock-detail-action"
            @change="changeAction('start')"
            value="start"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'stop'"
            :title="$t('time_clock.index.clock_event_options.stop')"
            name="time-clock-detail-action"
            @change="changeAction('stop')"
            value="stop"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'pause'"
            :title="$t('time_clock.index.clock_event_options.pause')"
            name="time-clock-detail-action"
            @change="changeAction('pause')"
            value="pause"
          />
          <f7-list-item
            radio
            :checked="detail_data.status === 'resume'"
            :title="$t('time_clock.index.clock_event_options.resume')"
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
import API from "../api";
import dialog from "../mixins/dialog.vue";
import timePicker from "../mixins/time-picker.vue";
import Photo from "../components/photo.vue";

export default {
  name: "DetailActivity",
  mixins: [dialog, timePicker],
  components: {Photo},
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
      self.$f7router.navigate("/time-clock/map/", {
        props: {
          edit: self.edit_acces,
          latitude: self.detail_data.latitude,
          longitude: self.detail_data.longitude,
          accuracy: self.detail_data.accuracy,
          address: self.detail_data.address,
          callback: self.editCoordinates
        }
      });
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
      ///detail_data.status === 'start' || detail_data.status === 'stop'
      const data = Object.assign({}, self.detail_data);
      if (data.status === "pause" || data.status === "resume")
        delete data.image;
      delete data.user_name;
      delete data.icon_url;
      delete data.id;
      API.editAttendance(self.detail_data.id, data).then(() => {
        self.$f7router.back();
      });
    },
    deleteAttendance() {
      const self = this;
      if (!self.edit_acces) return;
      API.deleteAttendance(self.detail_data.id).then(() => {
        self.$f7router.back();
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
      console.log("TCL: openCalendar -> self", self);
      self.calendarInstance.open();
    },
    createCalendar() {
      const self = this;
      let date = new Date(self.detail_data.created_at);
      self.calendarInstance = self.$f7.calendar.create({
        value: [date],
        openIn: "customModal",
        backdrop: true,
        closeOnSelect: true,
        on: {
          change(cal, val) {
            self.detail_data.created_at = new Date(val[0]).toISOString();
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
      self.calendarInstance.destroy();
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
            url: self.detail_data.image,
          }
        ],
        theme: "dark",
        type: "standalone",
        toolbar: false,
        backLinkText: "",
        swiper:{
          initialSlide: 0,
          spaceBetween: 20,
          speed: 300,
          loop: false,
          preloadImages: true,
          navigation: {},
          zoom: {
            enabled: true,
            maxRatio: 3,
            minRatio: 1,
          },
          lazy: {
            enabled: false,
          },
        },        
        renderNavbar(){
          let editHtml ="";
          if (self.edit_acces){
            editHtml = `
              <a href="#" class="link icon-only" id="time-clock-reload-photo" ref="reloadPhoto">
                <i class="icon f7-icons color-white">reload</i>
              </a>
            `
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
              self.$f7.$('#time-clock-reload-photo').on('click', self.reloadPhoto);
            },
            close: () => {
               self.$f7.$('#time-clock-reload-photo').off('click');
            },
          }
      });
    },
    reloadPhoto(){
      const self = this;
      self.$refs.photo.takePhotoAsync().then(photo => {
        self.detail_data.image = photo;
        self.photoPreview.swiper.removeSlide(0);        
        self.photoPreview.swiper.appendSlide(`<div class="photo-browser-slide swiper-slide swiper-slide-active" data-swiper-slide-index="0"><span class="swiper-zoom-container"><img src="${photo}" ></span></div>`);        
        self.photoPreview.params.photos = [
          {
            url: photo,
          }
        ]
      });
    }
  },
  computed: {
    dateField() {
      const self = this;
      if (!self.detail_data) return null;
      return self
        .$moment(new Date(self.detail_data.created_at))
        .format("DD MMM YYYY");
    },
    timeField() {
      const self = this;
      if (!self.detail_data) return null;
      return self
        .$moment(new Date(self.detail_data.created_at))
        .format("HH:mm");
    }
  },
  mounted() {
    const self = this;
    API.getAttendancesDetail(self.edit_id).then(data => {
      self.detail_data = self.prepareAttendance(data);
      //test image
      self.detail_data.image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAlgCWAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAQABAADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD2KikooAWikooAWkopaACkoooAWkpaKACiiigAooooASloooASloooAKKKKAEpaSloAKSlooAKKSigApaSigAoopaAEpaKSgBaSlpKAFopKKACilooAKKKKACikooAWikpaACkpaSgAopaKAEooooAWiiigBKWiigAoopKAFopKKACiiloAKKKKACikpaACk7UUUALRRSUAFFLRQAlFLRQAUUUUAFFFFACUtFJQAtJS0UAFFJS0AFFFJQAUtJRQAUUtFABRSUtABSUUUAFFFLQAUlFLQAUlLRQAlLSUUALSUUtACUtFFACUtFFACUUtJQAtFFFABSUtJQAUUtJQAUUUtACUUtJQAtFFJQAUUUUAFFLSUALRSUtABRRRQAlLRSUALSUtFABSUUtABRRRQAlFLSUAFLRSUAFLSUtABRRRQAlLRRQAlFLRQAlFFFAC0UlLQAlFLRQAlFFLQAUlFLQAlFFLQAUUlLQAUUlLQAUUUUAFFJRQAUUtJQAtFJS0AFFFFABRSUtABRRRQAlLSUUALRRSUALRRSUAFFLSUAFLRRQAUUlLQAUUUlAC0UlLQAUlLRQAlLRRQAlLRRQAUUUUAJRRS0AFFFFACUtFFACUtFFACUtFJQAtJS0UAFJS0lABRS0UAJRS0UAJRRRQAUUUUAFLRRQAlLSUUALRSUUALSUtFACUtJRQAtFJS0AFFFFABRRRQAlLRRQAUlLSUAFFFLQAUUUlAC0UUUAFJRS0AFFFFABRRRQAlLRRQAUUUUAFJRRQAUUUtABRSUtABRRRQAUUUUAFFFJQAtJS0UAFJS0UAJS0UlAC0lLRQAUUUUAFJRRQAtJS0UAFFFFACUtJ2paAEoopaAEpaKKAEoopaAEpaKSgBaSlooAKKKSgApaKKACikpaAEopaKACiiigApKKKACiiloAKKKKACiiigAoopKAClopKAFoopKAFoopKAFpKWkoAKWikoAKWkpaACikpaAEopaKAEopaKACikooAWiiigBKWikoAKKWigAooooAKKKKACkpaKACiiigBKWiigApKWigApKKKAFooooAKKKSgApaKKACiikoAKWiigApKWkoAWiikoAWkpaKACikpaAEopaKAEpaKKAEopaKACikooAKWkooAWiiigBKKKWgAooooAKKKSgBaKSloASlopKAFopKWgAoopKAFpKWigBKKKKAFoopKAFpKWigAopKWgBKWikoAWkopaACiiigAooooASiiloAKKKKACkpaKACiikoAWikooAKWikoAKWikoAWkpaKACkpaKACiiigBKWkpaACiiigBKKWigAoopKAClpKWgBKKWigAooooAKKKSgBaKSloASloooAKKKSgBaKKKAEopaSgBaSiloAKSlooAKKKKACiikoAWiiigApKWigAopKKACilooAKKSloASlopKAFooooAKSlooASilooASilooAKKSloASlpKWgApKWigBKWkpaAEpaKKAEopaKACiikoAWkopaACkpaKAEopaSgBaSiigApaKKACikpaAEpaSloAKKKSgBaKSloASloooAKKSloAKKSloAKKSloAKSlooASlpKKAFpKWigAoopKAClpKWgBKWkpaACikpaACikpaACiiigAopKKAFooooASloooAKKSigBaSlooAKKKKACkpaKAEpaKSgBaKSigApaKSgAooooAWikooAWkpaSgBaKKSgBaKKKACikpaACiikoAWikooAKWikoAWkopaAEpaSloAKSiloAKKSloAKSlpKAFpKKKAClpKWgAopKKAClpKWgApKWkoAWiiigAooooAKKKKACikooAWikooAWkpaKACikpaAEpaKSgBaKSigApaKKACiiigApKWkoAWikpaAEpaKKACkpaKAEpaKSgApaSloASiiloAKKKKACkpaSgBaKSloASloooAKSiloAKKKSgBaKKKACikooAWkpaKACiiigAooooAKKKKACimvIqDLMBVaS9A+4PxNK47FukJA6kVlS6iQOZMfSqkmpj3P41LmkUoNm/vQfxD86A6E43r+dc3/aIoW/55FL2iK9mzpetLWAl8ByGI/GrcWonA+cH601NEuDNSiq0d5G+M8VYBBGQQapO5NrC0UlLTEFFFFABRRSUALSUtFABRRRQAUUUlAC0UUUAFFFJQAUtJS0AJS0UlAC0UUlABS0UlAC0lLRQAUlLRQAUUlLQAUUUlAC0lFLQAUlLRQAUlLRQAlLRRQAUUlFAC0UUUAFFFFABSUtJQAtJS0UAFFFJQAtFFFACUtFJQAtFFJQAtFJRQAtFJS0AFFFFACUtJS0AFFFFABRRSUAFLSUtACUtJS0AJS0UUAJRS0UAFFJS0AFFJS0AFJS0UAFFFFABRRRQAlLRRQAUUUlAC0UUUAFJS0lAC0lFLQAlLRSUALRRRQAUlLRQAlLRRQAlLRRQAUUUUAJS0UUAFFFFABRSEhRliAKoXWpJECEPPrSbsNK5ckmSIZYgVQn1M4ITCr696yLnUGYlmPPbms6a9Zj1wPrWUqhrGma02prnG4k1Sl1CQ8ZrMe49OKZ5oPOelc8qrOiNNFuW6Y9SaiM5P4VAz57U3r0FZOZqoFgTEnrThOR0quBntShenNLmDlLQuWHvU0d2feqeCKUZ96pTYnBGtFesOQa0LfUGUg81zyEjkdasxSkd+a1jUZk6aZ1cN6kmNxwfWrOcjiuXhumU81p2t8QAM5HpXRGomc8qbRq0tMjkWRcqafWpkFFFFABRRRQAlLSUtACUtFJQAUUtFABRRRQAUlLRQAUlLRQAUUUUAFFFFABSUtFABRRRQAUlLRQAUlLRQAlFLSUALRSUUALRRRQAlLRRQAlFLRQAUUUUAFFJS0AFJS0UAFJS0UAFFFFACUtFFACUtFJQAUtFFACUtFFABSUtFABRSUtABSUUtACUtJS0AFFFFACUtFJQAtJS0UAFFFJQAtFFFABRRRQAUlLRQAUUUUAFFFJQAtJS0lAC0UUUAJRS0UAFJS0UAJS0UUAFFFJQAtFJS0AFFFFABRRSUALRRSUALSUtFACUUtFACUtFJQAtQz3Edum5z9BUV7fxWackFz0Fc3c30k7l5G4NRKSRcY3L93qZmJ5wvpWRcXmcnNVp7n0Iqm8xNc8p3OiMCWW4yDzVdpC3PWo2kH1qMSZPWsJSNoxJyRkZzS5yeRxUQ5HOalAyMVi2bJDwPepBjNRjIOKeBjmgZIFBp4Tv1xTV61MvvTQmNCfjS7TUwWlEdXYlsiVcingEc07y8ckU7bTsIQOVxViKcqQQaqlfemhiDTUrEuNzoLS8yRhsGtaKYSD0NcjBMQa1bS7O4BjXVTqXOWpTsb1JUUMwcAE81LXQc4tJRS0AJRS0UAJS0UUAFFJS0AFFFFACUUtFACUtFJQAUtJS0AJS0UlAC0UUUAJS0UlAC0lLRQAUUUUAFJRS0AJRRS0AJS0UUAFFFFABRRSUAFLRSUALRRRQAUUUUAFFJS0AFFFFACUUtJQAtJRS0AFJS0lAC0UlLQAlLRRQAUUUUAFJRS0AFFJS0AFJS0lABS0UUAFFFJQAtJRS0AFFJRQAtFFFABRRRQAUlLRQAUlFLQAUUUlAC0UUUAFFFJQAUUtJQAUtJS0AJS0lLQAUUUUAFJS0UAJS0lLQAUUUUAFFJS0AJRS0lABVDUtTS0TapBkP6UalqKWkRCn5zXHXd60z5Y8VnOdjSEL7li4vGmk3Oc5PFU5p8k84UVEJAQWNVp5geCeBXM2dEUOeXedxPA6VE7AAkn8Kj35x2FQu+c4rO5qkPZyTxwPSlQ+tQBxUqMTz3rNmiLSnPSpAc8YqBDng81MhwOMVmUSAfrUigios4HSpYs55HHWmMlUn61MnH40xBxnPtT0yeMVSRLJ0yeVFWFQYyaamAMDFSDnHatUjJsTb9cUjIB2qTHHrTduOtOwrkBQdqjaMDIzVplz0qIx+1S0UmVxkfWrEEpB68imle2KYBtOaE7A1c3rS5DqAT8wrTt5xKCp+8P1rmbaYowIP1rRjnKFZFJzmuuEzknA26Wo4ZVmjDD8RT63MBaSlooASlopKAFoopKAFpKKWgBKWkooAWikpaACkpaSgBaKKSgBaKSigApaSloAKKSloAKKSigApaKSgBaKKKACiiigApKKKAClpKWgAopKWgAopKKAFopKKAFoopKACiiigApaSloAKKKSgBaKSigApaSloAKSlooASlpKWgBKWikoAWikooAWkoooAWikpaAEopaKAEopaKACiiigApKWkoAWkpaSgBaKSloAKKKSgBaSlooASlopKAFooooASilooAKKKKACiiigBKWkpaACiiigApKWigBKWiigBKWiigAqveXS20RJIDEcVM7BELNwAMmuX1W9MshNTKVkVFXZnarfmV85PPasd5MsSTRcyl5WOc1WZyTgVxyd2dcVZEpfC9agZsnr+NIzGmF8AjNSykIzYGM1Huz06UjMc03dmoZoiQEA1Kh5xioA2KkVulQykW06c1OgyMDtVaI5x3qwuRUFkwHIz3qdVAQe3SoUGccHmpxzgYxiqRLJE5I9MVYjQZBNRjAA+lSoc4PcVaJZZQDG0YqUKccmoosDJ9amBJrVGTFAA9aCPpTlAx2pxXjnvVWFchIOelMYA1KwINNbpUspFdx1qIk1PIMCqrHA5HeoZaJUYircUuMc8Vnhsc5qaN8ZGetVFmcomza3Jt5gc/I3X3raBBAIOQa5dJMxEHtWvpV0HTyWPTla6oS6HLOPU0qKKK2MgopKKAFooooASlpKWgAooooASlopKAFpKWigAopKKAFpKWigBKKWigAoopKAFooooAKKKKACkpaSgBaKKSgBaKKKACikpaACiiigAooooAKKKKACkopaACiiigApKWigAooooASilooAKKKKACkpaKACiikoAWiiigApKKWgApKWkoAWiiigAopKWgAooooAKKSloAKKKKACkpaSgBaSlooAKKKKACkopaAEoopaAEpaKSgBaKSloASloooASilooAKKKSgBaKSigBaKKSgApaSloASiijpyaAM/V7kwwbAcE9a4y+uMKRu5/pW1rd3vlxngHpXMXTZPJzXPUep0QWhTlfryeaiBIH1oc5Yk4x2wajZyTk1zs3Q4uO9NdsdutMLc+wpGfPAFSWkBOOO9IDk4pBTgPSoZQmecYqVRmmKpLdKsxoD1FS2UiSLgcVbiGTgn8KhROgFWVTHbBqSiRV4BPXFTJwCP51GB8oxUgGD1JzVIRMMEDjFSp1HNQ8nn1qWJsZ4q0QyzHnp+dSB+g7+1RxetSEKPm71qjNkyuKcXGMnpUS8jpUgBAxk4qrkiPzzTGNPIOe4pjggZ7mkxohk6HtVVyKtOMD1qs4rNmiIwRT1bj6VCMg9Kk4pJg0W4WJBqa2uGgnBHY8VUhcgjmnvkHI6itU+pi4nYRSCWNZF6EU+srRrjehiPpkVqV2xd1c42rOwUUUUxBS0lFABS0UlAC0lLRQAUUlFAC0lFFABRRRQAtFFJQAtJS0lAC0lFLQAUUUUAFFJRQAtFJRQAtJRS0AFJRRQAtFJRQAtJS0lAC0UmaWgAopKKACilpKAFopKKAClopKAFpKKWgBKWiigAopKWgBKKKKACilpKACloooASlpKWgBKKKKAFooooAKSiloAKKKSgBaSlooASlpKWgApKWigBKWkooAKWiigApKKKAFpKWkoAWiikoAWiiigAoopKAFpKWigApKWigBKWiigAooooAKSiloASoruQR2zsTjipqy9cm8u024+9SbshpXZyV/NumYluayJ3O0gDr1q5O+XY9jWdcDAyc+mK5GdSKbyEtjjioy+OadIcHIxzVf0rNmiJN1BbnqKjLUgOT/nioZaJw2TUqDPeq6nFWEaoZaJVUDuKniFQoxJHGatIMDjkVLKJo0zVhF49aijPPSrKnjOaEAgUgEelPAJAOfrxTl/vHHPX609eG478VSQrgo9DUyDOOvFRjjoBUqKNvU4qkJlhc8EHPtUmB1596hQjj1HvUm4g5rRGTHrweoxUmcjBqAPn0Jp2eMH8qdxWJVww96CuT701CCT14p3OfamBCyZ5qvImDxV117ioXAIJxUNFplBgc4ximjOc81YZR7VEwwagoVTUucrzUPTvSq/PJ61SZLRpaVceTMCc4BrqAcgEdDXHW5xIreh5rq7R99sh9OK7KT0scdVa3J6KKK2MQpKWkoAWkoooAWikooAKWiigBKWikoAWiikoAWikooAWkopaACikpaAEpaKKAEpaSigBaSiigAoopaACkpaSgBaSlooASlpKWgApKWigBKKKKACiiigBaSlpKAClpKWgBKWikoAWiikoAKKKKACilooAKSiloASlpKKAClpKKAClpKWgBKWkooAKKWkoAWkoooAWikpaAEpaKSgBaKSloASlpKKACiiigBaSlooAKSlooAKKSloAKKSloAKKKSgBaSlooAKKSigAoopaAEpaSigBaSlpKAFrnvEk2HWPPQZroa5LxJJtvG+mKiexcNznJGHmHHTP0qjcndndn1qd2BLMSTk8VWuSduM8L1rlZ0Ioycge1Qk859KlkOQcECoGPvUs0QhOaclR85qSNCehI9ahlIeD3x0qZAW6VHgIN24bR74pUvoQc7h+FTZsq6W5ciBQYJyfepxIAMnr6Vlvq0KkDOKifWYskhgfbNP2bFzo21nBbAq0s6q2A34Vyi62pb5Ag/GraaxGwBIPPXnBpumwVRM6tJF2Dn6809Xz3HWsGHVIjtCscnkGry3ilVPOM84qbFJmiTlhnmpY27Cs+K5Dkc9smrMcuMccd+aLjL6EnGDmn8DnNVFccYzUpcgc55qrktEgxuyBz9KkBywJ6VV8zb1PFKZQR8rYz700xNF4Ed6cWXpWd9oGQpP0OealWcHAJO70xVXJsW2ZcYz0qF3HQCoWnIwP6UCcngk49aTGhrHIIqFjk81MxDdO9RSIQMms2aIjzmlJ5pnQ5FOLYxQhMtWr5lA9a6jTCfLZT7EVyUJxIpHQkV1un8DGf4a66LOSsXqKKK6TmEpaKKAEopaKAEopaSgAopaSgApaSloASilpKACilpKACloooAKKKKACiiigApKWkoAWkpaSgBaKKKACiiigAooooASloooASlpKKAFooooAKKSloAKSiloAKSiigBaSlpKACilooAKSlooASlpKWgApKWkoAKWiigAopKWgApKWigApKWkoAKWkooAWkpaKAEoopaAEpaKKACiiigBKKWigApKKKAFpKKWgAooooASlpKWgApKKWgBKWikoAWkpaKACiiigApKKWgAoopKAFoopKACuJ8Sv/pzZPqK7auE8SZ+3ScZw3NZ1NjSnuYbHjoPSq9yRtx371YUENycnOfpVeZMyH2Fc5sjPkBzwO1QP8oGe9WZhg1WlGTgZzUGiGIGZgBzT7mdbVcsDk9gaeB5MJkOBgcVzt9cPNMxYMT78CnGN2KUrEt5ftLnaP/Hs1V+2uq9+fWmLBKxBwMHuKt22mNLwy4+la3UTPWTM6S5m3Fc5HoM1HHcyRtySM9jzXUJoEZUHGaa/hxW6KSfpU+2iP2Ujn/twU/MvHcrUi35PQkDtxWhPoGwYwapPpkiDA/OqU4slwkizaXUkhDK2GXnitWHUJFhEQOQ8nOTWBDBJBJk+nNXY5cR85yaiVmXFtHUWmoK4Cs+Mn5R3Na8Mo4PJrjLaf99uHB7ep/wrdgucgc1zyVjog7nRRy5HT6c1O0mVHXFZFtc9Oce1XPOJGQ1JMpkjzlMk42mq813HGdpfGar3VwFTkcVi3N4pPGS2cAZprUHoba6iM43dBjPfNRyaxtJCMU5wWJ6f4mudjuHY8uRznPoKpX17GvyAbjn72eBWiiZOWh1A8Rpv8tXYjONxxj86uW+tRliGkXB6Z6158LsBOoYnvU0epCHDDlj2xgVpyGfOz0mC/tywDNtLdM1eLxumQRXl8evSl8MmR9eK2bTW1MOGlYHPTP8AjScGilUR1rIN24dKa2SBWJbarLLKBvGBzyQM1sxkSRBlOf6Vk42NFK5Ytsll+tdfp64X8K5Cy/1oABrsbAfuyc10UTmrluikorqOYKWikoAKWiigApKWigBKKKKAFooooAKSlooAKKKKACikpaAEopaKACkopaAEpaKKAEpaKKACikooAWikpaACiiigAoopKAClopKAClpKKAFpKKKAClopKACloooAKKSigBaSlooASloooASloooAKKKKACikpaACkopaACkopaAEpaKKAEopaKAEpaSloASloooASiiloAKKKKACiikoAWiiigApKWkoAWkpaKACiiigAopKKACilpKAFoopKAFpKKWgAopKWgApKKWgApKKWgBK4bxGCL+U4713Ncb4ojIvGPY8ms6mxpT3OZjGZCTxUbgl296mHynPXtSMmIy2OT2xXOzZGZKMSZ9Kh2DJI61YmGCenNQHkHsQOcVBqilqAm27RtKj61nrbEHjDj6VosN5wGJ9eakS3VR349aq9kRbUpxQ7Rxge2Kuw7Aef5VBNKqHA61UfUo4zhnyfReTWbTZqrI6OGQED0q9E0fGa4r/AISHyzhY+P8Aaanx+J3zjzI0z9TU+ykP2se5200MDDgDFY97Zx8suKx/7buXOYZYJMjoGI/nTTrc6MEuEZM+vT86fJJC5osfNb4z0Iqk6AdOKvfa45wemapT8NkH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gBKWikoAKWiigBKWiigApKWigBKKWkoAKKWigApKWigApKWigBKWkpaACiiigApKWigAooooAKKKKACkpaKACkpaKACiiigBKWkpaAEopaKACkpaSgBaSlooAKKSigBaKKKACiiigAopKKAFrz34hQk6ijY+/CP0r0GuY8cWJn06O5QZMLYb6GsayvA3w7tUR5gR50JU9RwazXtZkckLlR3rWlgfzsx5y3apLhFigCDlj1NcVzv2ZlaZMF1KOI9Hcce9dLeABMg8mufsbYNrts2OVYn9K3tRwGGT05rVbHPP4jPd/n9qmLYAJxmqrP8ANgfWn78xZA6etJoRBJN749qRJcHg1XlJyaYkh7c1DRopGrHKH4DYNWkkbgAj/GsmGTJHH4Vfic1DRomXxPkfOcEVFJOcE7jmmD5hx19xTJEI60DKN3OwB5/WufuZXSYSrnIPSt26I5GBWNcx4boa1gYzGPqw2FSSpPWsmURSOWGST3q86RlsFc0NEikYXPHNbJJbGLbe5n/Z0HzAkH1rQstTeEhZXLDs3eoXUYPGKgEWfvHHvVNX3IWj0OkGrKqcEfnQmtleSenvWKljIVBBPNSJaDncRx71nyRNeeRoXfiG7nQx23yernr+FYUls8jF5JCzHqSea2bdYFwSoAPBzTvs9vP8vGf7tNe7sS/e3INFurizmCrIWT0J6V29rdvcRcA4PU1zNhocJkWTnr0zXW2kGFCqvArCpZs6KaaQkicDgj3qIF0bO4HFXnh+U55NUnG0/MMVkal2CfOG61fimGM5OfSsWOUK2FwPpVlJlK8Zz2waadgsarXPHPHt2pgmy/XrVES+vH40qS5baDSuCRq5DrjJqQDfZyrjjZzVOGXJA61ahfNtOxOMLito7GMtzX8KqVgkHstb1YvhjBtJCPUCtuuyivcRx1v4jCkpaStTIWiiigAopKWgBKWiigAoopKAFoopKACloooASlpKKACilooASloooASlpKWgAopKWgAooooAKKKKACiikoAWiikoAWikooAKKWigAooooAKKKSgBaKKKACkpaKACkpaKACkpaKACiikoAKWiigBKWikoAWkoooAKWikoAKWkpaACiiigBKWikoAWkpaSgAopaKACkpaKAEoopaACikpaACkpaKACkpaKACiikoAWiikoAWiiigAopKWgBKWiigAooooA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sFTzkYra0NILgFlySGI5HX6VpwafCznMYOR6Vcj0i2KkFSv+6cGoc0zdUG+o4WcHmW4cAbpAK6aDTYdoAQYrn49DI27JXfH3d7EkVr2b6pAuyTZJt/iKnNToDozLUug28t7FMEGQpB4rVi0yIIEKDb9Kx/tGp/alkLRqqDAUA8/WrMer3ociVIlX+8MmmrXJdKoU7/Q4EvpGVR8wFcp4j05IHR14JBrpphdy3rz2zSEScvkZBP07VmXvh67vWkee5fLDvj5R7UaItUpnA/2jEUbfn5TjIFMXV5l5iR/auug8FWVnkkNM3bceKJNDhjY7kGf7oHSm5wIdOfVnGx3Lyyb3B5PIrY0pgJg75A9aZfaeYNzKmCDSWDHfGGHXn603ZrQxSaep1CEbQAScjNO69M06FFEKnB5GRRtweetcnU7FsIo7Gp1IzjNRqPlzUyLjmmSXNOjMt4oHXPFenW0Xk20cX91QK4jwtZefqCuV+VOTmu7rtoRtG5xVpXlYWiikroMBaKSloAKKKKACiiigAooooAKKSloAKKKKACiiigAopKWgApKWigAopKKAFpKWigAooooAKKKKACiiigBKWikoAWiiigAooooAKKSigBaKKSgBaSlooAKKSloAKSlpKAFooooAKKKKACiiigAooooAKKKKAEpaSloAKKKKACiiigApKWigApKKKAFoopKAFpKWigAopKWgApKWigAopKWgApKWigBKKWkoAKWkpaACkoooAWiikoAWkpaSgBaKSloASloooASilooAKSlooASilpKAMbxS+NMC/wB5q4zV3+QOOhAOa67xY/l2UTdtxrjbxxJBxyQMYrnnubw2RRE29CrHg1i3sOHOeauGQIeeR6VBcsHbd1yKzNEYzja/1oB6e9SzLyfaoBx1oAVj09qTfgc9aU9/eo2Y46UmikypIFaRmY9+taenoPKyBgVmTN823HetS0kQx4JA/GnLYUbcxNPEpUMM561HauFfPSrLFSuBxVJxsc4zWaNX3NmG6QY3YFaNtcxsw5zXLJOy9anW4xhkcg96TiaxqLqdtBIrNuArUhYY4NcBb6xNFkFgce9XIvEU4PUc+9NOxo2n1O53gsMgZ+lP8qJuTGp9q45PE8wGSoPqc1ZTxPIQDiq50TZ9GdWVAUAYA9qpSlVYgcmsQa9JPx09TSjUC5+9UyncajbdlyZ0jBPBb0qiYi+WIyc0vmAgk9TUyDCA461lcT1MXWbEG1LAYIrD0y2H2xVbadv8q66+RWt3JU4Az9a5qH5bsFcfeO7jpVxejRjNapmsAFQL6cUMQBx3pm7K5PWnMQTioSLb0HJzVqBPMIABqqhyMetdH4d0trq4j3D5TyT6CrjG7sZSlZXOo8M2H2Wx81hh5fbtWzQqhVCqMADAFLXoxVlY4G7u4UlFLTEFFJRQAUtJRQAtFFFABSUUtABRRRQAUlLRQAUUlFABRRS0AFJS0lAC0UUhoAKWkooAKKWigAooooASilpKAFooooAKKKSgBaKSloASilooAKKSigApaKKACkoooAWiiigApKWkoAWikpaAEopaSgBaKKKAEpaKKAEpaKSgBaSlpKACilooAKSlooASloooAKKKKAEopaKACiiigApKWkoAWiiigAoopKAClpKWgAoopKAClopKAFpKWkoAKWkpaAEpaSloAKSlooAKSiloASilooAKKSobq4FvEW79qAOd8bTqLOOLjPOa4N7vMXv3rpPFE5ls2cnLBsiuGa4w/X5W/nXLN3kdMV7pJM4OD6dqhaQtxmo3lOTmovM55qRiyYORiqrAg4qcnJ+tRNzn1pjIw2RzTHB28U/GDnsab0z65pAVnID5zzn8qfbEhtrNgA1FcLhy30xTIDk8k4PeqtdE31NxW3jk5xwKY689KSJgEB4xjipwhbB7Vg9DoWpWMW4ZxTGgcD5SauFQOBSgcUXHymRMJEBPTFQieTPHVuM+grUu4g8ZB4rOjjJLkcDOAa1i7oylGzFW7dSNxJGMVYhuZAcknB7Z6VCLfc3rmtOwtFd8OvQY+tDaBJ3J7UyyY2g4PvWtbW7gDJ5NSQWyxgDaB6VdSPIrmlI6YxsMRCOCOlWQ2wck4oVAD06VG7jGeABUlFbULwJGFP3TweK52BiL2ReQpx9Kv6rcI6OQ2MZxzVCwIlkYyY3EAitoqyMJyuzQBYLknnuKlQce9RgZbmp4Iy7ADvRYVy3Y2zTzhFHTrXo+g2QtbMP3fpx2rmtA0syzKij3Zsdq7kAKoUDAHArqowtqc1WV9AopaK3MBKKKWgBKKKKACilpKACilooAKSlooASiiigBaKKKAEopaKAEopaKAEoopaACmmnUhoAQUtIKWgAopaSgBaSlooAKSiloAKKKKACkoooAWkopaACkpaSgBaSlooASlopKACiiigBaSlooASiiigApaSloASlopKAFpKKKAClpKWgAopKWgBKWkpaAEpaKSgAooooAWikpaACkpaKAEpaKKACikpaAEopaSgApaKKACikpaACiiigApKWkoAWkpaKACiiigAoopKAFopKKAClpKWgAoopKAFoqOaaK3iaWaRY0XqzHAriPEHxHhti1vpaiR+nmsOPwFNK4nJLc7h5FjGWIB9KwdUuiSxJrN8Mvdz2C3t7K0k9yfMJY9F7Cl1WXCsc1nJlQd9TB12f/AEaMHowOa4e4YxuUPQ/d9q7PVE87T48/3K4u8G/OfvLwa5nudEXpYi87cpyfmFJ5maptIQ2CfmH6inJKDyKqwFwPSls4IqqsnepFcZ60ASEcdqaR0PcUpOR1pOAelIdyleKSOoGBVeByWGcYWrd6ny7ugqjny+gGScfSrWxD3NmCUuwA+6BzWlEMrnGa5+0nZeSD8xrWtrkYIL9BWM4nRCReWMHoOtSC3I5K9aqRXOGZixAPArWiIdPvZBHXHSsmmjZNMpPahx0qqdOJyxwB24xzW2m0EK5AB4zimTqpZlU5XjHpTTY3FMzrfT1JO4c4rSs7MKVbB9vemrtGCMZx90VYjmaN1CEEE8e1D1EkkaKQeq49MnrUqptHIAx71El0hO0k8dvSn/aFCYOAe9Q0VcSeTZ24+tZGoXwRcowGeCKt3tyAjFScmuXu597Ek4xmqhG5E5WRDcXJkRlYAc44GMVb0eIvE0jDpwtZBkLH72TnGRXTWULJaIMfO2Sa3eiOZO7HopJAxz/WtzSLBp5FAXcSwAAqraWhJ37QQR+Ndr4bs44p9wAJVT+dEI3YTlZG1p1itjbBOC55Y/0q3RRXYlY5BKWiigAopKWgAoopKAFopKWgAopKWgAopKKAFopKWgApKWkoAWiiigAopKWgBKKWigBKDS0UAN70tFAoAKKWigAoopKAFoopKAFopKWgBKKKKAClopKAFoopKAFopKWgAooooAKKKKAEpaKSgApaSigBaKKSgBaKKSgAopaSgAFLSCloAKKKKACikpaACkpaKAEpaSloASiiloASlopKAFooooAKKKKAEpaKKACkopaACkoooAWiiigApKWkoAKWikoAWiiigAooooAKSlooAKKKKACsvW9fs9DtzJcODIR8sYPJ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ccGlzQwyM00GgB9FIDS0AFLSZooAWkopaACiiigBKWkpaACiikoAWiikoAWkopaACiikoAKKKKAFpKWigBKKWigApKWigBKWkpaACikooAKKKKAClopKAClpKKAFooooAKSiloASlpKWgBKKKWgAooooASilooASlpKWgBKKKKACilpKAClopKAFopKWgAooooAKKSloAKSlooASloooAKKSloAKKKKAKNFFFIYZ4oooxQAlFLikNABSUtJQAjcCocbmp7mmpzQAoAArK1y4EFnI2eimtYniuW8WT7bV0z1FNasmTsmzhnbJlkJ6Ka6jwFZgie5I6AIP51yrD/Q5W9WC16H4MtxFoSNjmRif6V1VNInk4Zc1W5rtF7VEVINX9gxUbxZrkPXKokI4NPD5oaKmhSKQx4anKc1HT1oAlFIw4oFOI4oA818fytY+INPugp8soyP9M0kZXbvyDx8p9q6/X9Hj1exngdQSUOw+jdq8+0W4YxtZTZEtuSAp6kf/AFqxmi/M0SSTg0Y9BTtvO496DxUARsuKicZPFTEHGKYVpDK0iGqzx54xV9lqJ4qYGXLF1Iqs8Wa1XizUDwe1MDM8s5pREc1eMGOgpywe1O4imIAeCM1XuNG35eFQG67exrZW374qYRYI4ouNHICDy3KyKVI7VOkca87j9K6S+htVtnkukBRRjpyT6Csu0sdPuuI1uMHuwwBS1ZakiCC3899sKFj3JOQK3bLTY7bDON0h9qt2NlFEgSBAqjqf89a1ILMM3IOKQnK5Da2ryfMe9b9lbeWo9TUdtbhQOOlaUMeBxTRBJFHgcCrKJjmkjSpwveqEOQcVIOKao4p3XvTATNMbmnNSEcUxGUmlzy+KbfU14jt4yje+a65DlRVHTVzFISPvMauoNvFaRVkJjqWikqhC0UUUAFJS0UAJTGGDT6RhlaAGg07NRinA0AOpaTNFAC0UUUAFLSUUAFLSZooAWkpaSgAoopaAEpaKKACkpaKAEoopaAEoopaAEpaKKAEoopaACiiigApKKWgApKKKAFpKWigApKWigApKWigBKKWigApKWkoAKKWigAooooAKKKSgBaKKKAEopaKACkpaSgBaKSigBaKSloAKKKKACiiigAooooAKKSloASiiloAKKSloAo0UoNLikMTFFFFACUhpe1JQAUh4pTTWNAEZ5NOAGOlI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AyQmmE0hPFNJoAUmkHNJmlzQA4ClpAaCaBCE80maDQKBig0uaSjFABRRR3oAYR3pucU5hmm7aAA8ilWMmlHFPDgUAN8vFKTg4p4dTxUTnG4+1AHOTy5uJP8AeNCvzVYsXlY+rGp41JNICwjVdtmzxVNIjVq3Uq3NAFtRlqWU5YKO1OTgZPaoQcsT60APFXrEdTVAda0rQYgB9aaAsUUUUxBSUUtABSUtJQAUUtFABRRSUALSUtJQAUUtFACUtJS0AJRS0lAC0lLSUALRRSUALSUUUALRSUtABSUUUAFLRRQAgopaSgApaKSgBaSiigApaKSgBaKSloASilpKAFpKWkoAKWikoAKKWigBKKKWgAooooA87HWpB0qMdaelQUSjp1p69aiz0qQcUwJ0PFTIeelQIeKlUnNAiwtSioVJzzUq5pgSUA0gzSjpQAde1IRxS9aDQBGeKWlccUnfmgBrCmHNSEZphFICIgVGw5qcio3HOaBkB57Uo6U40nQjigA6e9NPt3px+lBHNADQSKlBqEnmng5oEWEPpUyNkiqqnBqdDk0wLKmp4mqohyasRGgRZHNIRSKeKU80DIXFV3FWnFVpRigCEmmwjfcKvvmkf1qTTsG859DSA1o14p+KdwBxTSaYCUUUUAFLRRQAUmaDSZoACaTPNIaTNACk0wmlNMc4FAETtTUXJyaGpwBoAdEMTEjstT7xioIQRI+fQVJtOaAFLZppNKwwKYSKAFzRupmaAM0ASBqcDmowKkHSgBaBQKWgAoJo4pM0ALQBQKd2oAYRTT1qQimEc0ANPFMwalIp6oMUARIrZyaRzw+fQ1MRjionHyt7igDm4rcs5OO9aEVrjqKsJEkYwBSlwKQAEVBSKctTGck1LCuSBQBJIcR49aYBRI2ZMdhSigByjP41rRLsiUegrOto98yjsOa06aELRRSUwCilooAKKKSgApaSigBaKKKACikpaAEpaKKACkpaKACiikoAWkopaACkpaKACiikoAWiiigAopKWgAooooAKKKKACkpaKACiiigAooooAKKSigApaKSgBaKKKACkpaKACiiigAoopKACiiloA86FPXmoxTwT15qCiT2p6kio88DrTh0NMCdT71OhyKrKelTxnpQIsqakU1CpzUg7UATA0CkXkUvSmAo60E0gPNBPNACnpzSEc/WlzSHOaAE6U31p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";
      self.loaded = true;
      self.$nextTick(() => {
        self.createCalendar();
        self.createTimePicker(self.detail_data.created_at);
        self.createPhotoPreview();
      });
    });
  },
  created() {
    const self = this;
  },
  data() {
    const self = this;
    return {
      sheet_action_opened: false,
      new_action: null,
      edit_id: self.$f7route.params.id,
      edit_acces: true,
      detail_data: null,
      loaded: false
    };
  }
};
</script>
