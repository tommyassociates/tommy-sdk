<template>
  <f7-page class="time-clock-main-page" :page-content="false">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('time_clock.index.title')}}</f7-nav-title>
      <f7-nav-right class="time-clock-navbar-links">
        <f7-link href="/time-clock/search/" icon-only>
          <f7-icon f7="search" />
        </f7-link>
        <f7-link href="/time-clock/settings/" icon-only>
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-toolbar :style="toolbarStyle" class="time-clock-main-toolbar" v-if="shifts_enable">
      <f7-button
        raised
        fill
        v-if="!clock_on && !break_on"
        @click="clockOnClick"
        class="time-clock-toolbar-button clock-on"
      >{{$t('time_clock.index.clock_on_button')}}</f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on && !break_on"
        @click="clockOffClick"
        class="time-clock-toolbar-button clock-off"
      >{{$t('time_clock.index.clock_off_button')}}</f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on && !break_on"
        @click="breakOnClick"
        class="time-clock-toolbar-button break-on"
      >{{$t('time_clock.index.break_on_button')}}</f7-button>
      <f7-button
        raised
        fill
        v-if="break_on"
        @click="breakOffClick"
        class="time-clock-toolbar-button break-off"
      >{{$t('time_clock.index.break_off_button')}}</f7-button>
    </f7-toolbar>
    <f7-page-content :style="pageContentStyle">
      <!--Active -->
      <div class="time-clock-active" v-if="!view_other_users">
        <f7-list media-list class="time-clock-list">
          <Events
            :data="active_data"
            :devider="$t('time_clock.index.active_title')"
            :skeleton="1"
            :loaded="loaded.active"
          />
        </f7-list>
      </div>

      <div class="time-clock-active" v-if="view_other_users">
        <div class="time-clock-avatars-container">
          <Active-avatar :data="team_data" :loaded="loaded.active" />
        </div>
      </div>

      <!--<f7-block-title class="time-clock-divider">{{$t('time_clock.index.today_title')}}</f7-block-title>
      ADD SPLIT DAYS
      
      -->
      <!--Events -->
      <Events
        :data="attendances_data"
        :devider="$t('time_clock.index.today_title')"
        :loaded="loaded.attendance"
      />
      <Photo ref="photo" direction="front" />
      <Geo ref="geo" />
    </f7-page-content>
  </f7-page>
</template>
<script>
import API from "../api";
import ActiveAvatar from "../components/circle-avatar.vue";
import Events from "../components/events.vue";
import Photo from "../components/photo.vue";
import Geo from "../components/geo.vue";

/*
TODO: add shift empty page

*/
export default {
  name: "TimeClock",
  components: {
    ActiveAvatar,
    Events,
    Photo,
    Geo
  },
  created() {
    const self = this;
    API.user_id = self.getUserId();
  },
  computed: {
    pageContentStyle() {
      const self = this;
      if (self.clock_on && !self.break_on) {
        return {
          paddingBottom: "136px"
        };
      } else {
        return {
          paddingBottom: "74px"
        };
      }
    },
    toolbarStyle() {
      const self = this;
      if (self.clock_on && !self.break_on) {
        return {
          height: "136px"
        };
      } else {
        return {
          height: "74px"
        };
      }
    }
  },
  methods: {
    clockOnClick() {
      const self = this;
      self.$refs.geo.takeGeoAsync().then(cords => {
        self.$refs.photo.takePhotoAsync().then(photo => {
          const params = {
            event_id: API.shifts_active_id,
            latitude: cords.latitude,
            longitude: cords.longitude,
            accuracy: cords.accuracy,
            status: "start",
            address: cords.name,
            image: photo
          };
          API.setAttendances(params).then(() => {
            self.updateAll();
            self.clock_on = true;
          });
        });
      });
    },
    clockOffClick() {
      const self = this;
      self.$refs.geo.takeGeoAsync().then(cords => {
        self.$refs.photo.takePhotoAsync().then(photo => {
          const params = {
            event_id: API.shifts_active_id,
            latitude: cords.latitude,
            longitude: cords.longitude,
            accuracy: cords.accuracy,
            status: "stop",
            address: cords.name,
            image: photo
          };
          API.setAttendances(params).then(() => {
            self.updateAll();
            self.clock_on = false;
          });
        });
      });
    },
    breakOnClick() {
      const self = this;
      self.$refs.geo.takeGeoAsync().then(cords => {
        const params = {
          event_id: API.shifts_active_id,
          latitude: cords.latitude,
          longitude: cords.longitude,
          accuracy: cords.accuracy,
          status: "pause",
          address: cords.name
        };
        API.setAttendances(params).then(() => {
          self.updateAttendances();
          self.break_on = true;
        });
      });
    },
    breakOffClick() {
      const self = this;
      self.$refs.geo.takeGeoAsync().then(cords => {
        const params = {
          event_id: API.shifts_active_id,
          latitude: cords.latitude,
          longitude: cords.longitude,
          accuracy: cords.accuracy,
          status: "resume",
          address: cords.name
        };
        API.setAttendances(params).then(() => {
          self.updateAttendances();
          self.break_on = false;
        });
      });
    },
    getUserId() {
      const self = this;
      const userId = self.$f7route.query.actor_id;
      if (userId) {
        return Number(userId);
      } else {
        return Number(self.$root.account.user_id);
      }
    },
    getShiftActive() {
      const self = this;
      API.getShiftActive().then(data => {
        if (data.length > 0) {
          API.shifts_active_id = data[0].id;
          self.shifts_enable = true;
        } else {
          //self.shifts_enable = false;
        }
      });
    },
    prepareAttendances(data) {
      const self = this;
      data.forEach(e => {
        const user = self.$root.teamMembers.filter(
          member => member.user_id === e.user_id
        );
        e.user_name = user[0].first_name + " " + user[0].last_name;
        e.icon_url = user[0].icon_url;
      });
      return data;
    },
    updateAll(){
      const self = this;
      self.updateAttendances();
      self.updateAttendancesActive();
    },
    updateAttendances() {
      const self = this;
      self.loaded.attendance = false;
      API.getAttendances().then(data => {
        self.attendances_data = self.prepareAttendances(data);
        self.loaded.attendance = true;
      });
    },
    updateAttendancesActive() {
      const self = this;
      self.loaded.active = false;
      API.getAttendancesActive().then(data => {
        self.active_data = self.prepareAttendances(data);
        self.loaded.active = true;
      });
    }
  },
  beforeDestroy() {
    const self = this;
    self.$refs.photo.$off("camera:send");
  },
  mounted() {
    const self = this;
    self.getShiftActive();
    API.getAttendances().then(data => {
      self.attendances_data = self.prepareAttendances(data);
      self.loaded.attendance = true;
    });
    API.getAttendancesActive().then(data => {
      self.active_data = self.prepareAttendances(data);
      self.loaded.active = true;
    });

    API.getTest().then(data => console.log("TCL: mounted -> TEST", data));
  },
  data() {
    const self = this;
    return {
      clock_on: false,
      break_on: false,
      view_other_users: false,
      active_data: [],
      attendances_data: [],
      team_data: [],
      shifts_enable: false,
      loaded: {
        active: false,
        attendance: false
      }
    };
  }
};
</script>

