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
        @click="openTimePicker()"
      >
        <div slot="after">
          <input type="text" id="timePicker" readonly />
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.date_label')"
        :link="edit_acces"
        @click="openCalendar()"
        :after="dateField"
      ></f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.who_label')"
        :link="edit_acces"
        @click="openSelector()"
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
        @click="openMapPage"
      ></f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.photo_label')"
        :link="edit_acces"
        @click="openCamera()"
        v-if="detail_data.status === 'start' || detail_data.status === 'stop'"
      >
        <div slot="after" class="after-container">
          <div class="image" :style></div>
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
  </f7-page>
</template>
<script>
import API from "../api";
import dialog from "../mixins/dialog.vue";
import timePicker from "../mixins/time-picker.vue";

export default {
  name: "DetailActivity",
  mixins: [dialog, timePicker],
  components: {},
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
          callback: self.editCoordinates
        }
      });
    },
    editCoordinates(latitude, longitude) {
      console.log("TCL: editCoordinates -> longitude", longitude);
      console.log("TCL: editCoordinates -> latitude", latitude);
    },
    openCamera() {
      const self = this;
      self.$refs.actionSheet.close();
      self.$refs.cameraPopup.open();
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
        self.$f7route.back();
      });
    },
    deleteAttendance() {
      const self = this;
      if (!self.edit_acces) return;
      API.deleteAttendance(self.detail_data.id).then(() => {
        self.$f7route.back();
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
      console.log("TCL: getAttendancesDetail -> data", data);
      self.detail_data = self.prepareAttendance(data);
      self.loaded = true;
      this.$nextTick(() => {
        self.createCalendar();
        self.createTimePicker(self.detail_data.created_at);
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
