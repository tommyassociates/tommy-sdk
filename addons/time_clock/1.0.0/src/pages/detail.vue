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
        <f7-link icon-only @click="editActivity" v-if="edit_acces">
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
          <div class="name">{{nameWho}}</div>
          <div class="image" :style="imageWho"></div>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.where_label')"
        :link="edit_acces"
        :after="geoCoordinatesField"
        @click="openMapPage"
      ></f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.photo_label')"
        :link="edit_acces"
        @click="openCamera()"
      >
        <div slot="after" class="after-container">
          <div class="image" :style="imageWho"></div>
        </div>
      </f7-list-item>
      <f7-list-item
        :title="$t('time_clock.event_details.action_label')"
        :link="edit_acces"
        sheet-open=".time-clock-action-sheet"
        :after="actionField"
        @click="sheet_action_opened = true"
      ></f7-list-item>
    </f7-list>
    <CameraPopup ref="cameraPopup" @camera:send="getPhotoCamera" />
    <f7-sheet class="time-clock-action-sheet" ref="actionSheet" >
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
        <f7-list>
          <f7-list-item
            v-for="i in actionListCounter"
            :key="'action_list_'+i"
            radio
            :checked="detail_data.event == i-1"
            :title="$t('time_clock.index.clock_event_options')[i-1]"
            name="time-clock-detail-action"
            @change="changeAction(i-1)"
            :value="i-1"
            ref="actionList"
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
import CameraPopup from "../components/take-photo.vue";

export default {
  name: "DetailActivity",
  mixins: [dialog, timePicker],
  components: {
    CameraPopup
  },
  methods: {
    changeAction(val) {
      const self = this;
      self.new_action = val;
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
          selected: [{ id: 3 }],
          pageTitle: self.$t("time_clock.event_details.who_label"),
          multiply: false,
          getData: self.getDataUser,
          type: "team",
          onChange(asset, selected) {
            if (selected) {
              //self.$emit('itemAdd', asset);
              //self.addItem(asset);
            } else {
              //self.$emit('itemRemove', asset);
              //self.deleteItem(asset);
            }
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
    editActivity() {
      const self = this;
      if (!edit_acces) return;
    },
    deleteActivity() {
      const self = this;
      if (!edit_acces) return;
    },
    deleteClick() {
      const self = this;
      self.confirmDialog(
        false,
        self.$t("time_clock.event_details.delete_text"),
        self.$t("time_clock.event_details.confirm_button"),
        self.$t("time_clock.event_details.cancel_button"),
        self.deleteActivity,
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
      let date = new Date(self.detail_data.date);
      self.calendarInstance = self.$f7.calendar.create({
        value: [date],
        openIn: "customModal",
        backdrop: true,
        closeOnSelect: true,
        on: {
          change(cal, val) {
            self.detail_data.date = new Date(val[0]).toISOString();
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
    }
  },
  computed: {
    actionField() {
      const self = this;
      if (!self.detail_data) return null;
      return self.$t("time_clock.index.clock_event_options")[
        self.detail_data.event
      ];
    },
    dateField() {
      const self = this;
      if (!self.detail_data) return null;
      return self
        .$moment(new Date(self.detail_data.date))
        .format("DD MMM YYYY");
    },
    timeField() {
      const self = this;
      if (!self.detail_data) return null;
      return self.$moment(new Date(self.detail_data.date)).format("HH:mm");
    },
    geoCoordinatesField() {
      const self = this;
      if (!self.detail_data) return null;
      return self.detail_data.latitude + " " + self.detail_data.longitude;
    },
    nameWho() {
      const self = this;
      if (!self.detail_data) return null;
      return self.detail_data.name;
    },
    imageWho() {
      const self = this;
      if (!self.detail_data) return null;
      return {
        backgroundImage: "url(" + self.detail_data.image + ")"
      };
    }
  },
  mounted() {
    const self = this;
    API.detailGet(self.edit_id).then(data => {
      self.detail_data = data[0];
      self.loaded = true;
      self.actionListCounter = 4;
      self.createCalendar();
      self.createTimePicker(self.detail_data.date);
    });
  },
  created() {
    const self = this;
  },
  data() {
    const self = this;
    return {
      actionListCounter: 0,
      sheet_action_opened: false,
      new_action: null,
      edit_id: self.$f7route.params.id,
      edit_acces: true,
      detail_data: null,
      loaded: false,
    };
  }
};
</script>
