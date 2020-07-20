<template>
  <f7-page class="time-clock-main-page" :page-content="false" ptr @ptr:refresh="onPtrRefresh">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('time_clock.index.title')}}</f7-nav-title>
      <f7-nav-right class="time-clock-navbar-links">
        <f7-link href="/time-clock/add/" icon-only>
          <f7-icon f7="plus"/>
        </f7-link>
        <f7-link href="/time-clock/search/" icon-only>
          <f7-icon f7="search"/>
        </f7-link>
        <!--<f7-link href="/time-clock/settings/" icon-only>
          <f7-icon f7="gear"/>
        </f7-link>-->
      </f7-nav-right>
    </f7-navbar>

    <!-- v-if="attendances_enable && loaded.first" -->
    <f7-toolbar
      :style="toolbarStyle"
      class="time-clock-main-toolbar"
    >
      <f7-button
        raised
        fill
        v-if="!clock_on && !break_on"
        @click="clockOnClick"
        class="time-clock-toolbar-button clock-on"
      >{{$t('time_clock.index.clock_on_button')}}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on && !break_on"
        @click="clockOffClick"
        class="time-clock-toolbar-button clock-off"
      >{{$t('time_clock.index.clock_off_button')}} {{ formatDuration() }}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on && !break_on"
        @click="breakOnClick"
        class="time-clock-toolbar-button break-on"
      >{{$t('time_clock.index.break_on_button')}}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="break_on"
        @click="breakOffClick"
        class="time-clock-toolbar-button break-off"
      >{{$t('time_clock.index.break_off_button')}} {{ formatDuration() }}
      </f7-button>
    </f7-toolbar>
    <f7-page-content :style="pageContentStyle">

      <!--Active -->
      <div class="time-clock-active" v-if="!viewOthers && activeData !== null">
        <!--<f7-list media-list class="time-clock-list" v-if="formattedActiveData">-->
        <Events
          :data="formattedActiveData"
          :skeleton="1"
          :loaded="loaded.active"
        />
        <!-- </f7-list>-->
      </div>


      <div class="time-clock-active" v-if="viewOthers && activeData !== null">
        <div class="time-clock-avatars-container">
          <Active-avatar
            :data="formattedActiveData"
            :loaded="loaded.active"
          />
        </div>
      </div>


      <!--Events -->
      <Events
        :data="formattedAttendanceData"
        :loaded="loaded.attendance"
        v-if="loaded.attendance"
      />
      <Photo ref="photo" direction="front"/>
      <Geo ref="geo" :dialog="false"/>
    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from "../api";
  import AttendanceService from "../services/attendance-service";

  import ActiveAvatar from "../components/circle-avatar.vue";
  import Events from "../components/events.vue";
  import Photo from 'tommy-core/src/components/photo.vue';
  import Geo from "../components/geo.vue";
  import Blob from "../mixins/baseToBlob.vue";


  /*
  TODO: add shift empty page

  */
  export default {
    name: "TimeClock",
    data() {
      const self = this;
      return {
        viewOthers: false,
        clock_on: false,
        break_on: false,
        activeData: [],
        attendanceData: [],
        loaded: {
          first: false,
          active: false,
          attendance: false,
          duration: 0,
          timestamp: false,
          interval: false
        }
      };
    },
    components: {
      ActiveAvatar,
      Events,
      Photo,
      Geo
    },
    mixins: [Blob],
    created() {
      const self = this;
      API.actorId = API.getUserId(self);
      API.actor = API.getActor(self);
      self.$events.$on("time_clock:attedance_edit", self.updateAll);
      self.$events.$on("time_clock:attedance_delete", self.updateAll);
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
      },
      formattedAttendanceData() {
        const self = this;
        return AttendanceService.splitAttendanceIntoDays(self.attendanceData, self);
      },
      formattedActiveData() {
        const self = this;
        return AttendanceService.formatAttendanceActive(self.activeData, self);
      },
    },
    methods: {
      clockOnClick() {
        const self = this;
        self.$f7.preloader.show()
        self.$refs.geo.takeGeoAsync().then(cords => {
          self.$refs.photo.takePhotoAsync().then(photo => {
            const form = new FormData();
            form.append("event_id", API.shifts_active_id);
            form.append("latitude", cords.latitude);
            form.append("longitude", cords.longitude);
            form.append("accuracy", cords.accuracy);
            form.append("status", "start");
            form.append("address", cords.name);
            form.append(
              "image",
              self.dataURLToBlob(photo),
              `attendance_start.jpg`
            );

            API.setAttendances(form).then(() => {
              self.updateAll();
              self.clock_on = true;
              self.$f7.preloader.hide()
            });
          }).catch(() => {
            self.$f7.preloader.hide();
          });
        });
      },
      clockOffClick() {
        const self = this;
        self.$f7.preloader.show()
        self.$refs.geo.takeGeoAsync().then(cords => {
          self.$refs.photo.takePhotoAsync().then(photo => {
            const form = new FormData();
            form.append("event_id", API.shifts_active_id);
            form.append("latitude", cords.latitude);
            form.append("longitude", cords.longitude);
            form.append("accuracy", cords.accuracy);
            form.append("status", "stop");
            form.append("address", cords.name);
            form.append(
              "image",
              self.dataURLToBlob(photo),
              `attendance_stop.jpg`
            );

            self.loaded.duration = 0;

            API.setAttendances(form).then(() => {
              self.updateAll();
              self.clock_on = false;
              self.$f7.preloader.hide()
            });
          }).catch(() => {
            self.$f7.preloader.hide();
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

          self.loaded.duration = 0;
          self.loaded.timestamp = self.$moment(new Date()).format();

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

          self.loaded.duration = 0;
          //set back to the attendance timestamp
          self.loaded.timestamp = self.$moment(self.activeData.timestamp).format();

          API.setAttendances(params).then(() => {
            self.updateAttendances();
            self.break_on = false;
          });
        });
      },

      // getShiftActive() {
      //   const self = this;
      //   API.getShiftActive().then(data => {
      //     if (data.length > 0) {
      //       API.shifts_active_id = data[0].id;
      //       self.shifts_enable = true;
      //     } else {
      //       //self.shifts_enable = false;
      //     }
      //   });
      // },
      // getAttendancesActive() {
      //   console.log('getAttendancesActive 1');
      //   const self = this;
      //   API.getAttendancesActive().then(data => {
      //     console.log('getAttendancesActive 2');
      //     console.log(data);
      //     if (data.id > 0) {
      //       API.attendances_active_id = data.id;
      //       self.attendances_enable = true;
      //     } else {
      //       //self.shifts_enable = false;
      //     }
      //   });
      // },


      updateAll() {
        const self = this;
        return self.updateAttendances().then(() => {
          return self.updateAttendancesActive();
        });

      },
      updateAttendances() {
        const self = this;
        self.loaded.attendance = false;
        const otherOptions = {
          others: self.viewOthers,
        };
        return API.getAttendances({otherOptions}).then(data => {
          self.attendanceData = AttendanceService.prepareAttendances(data, self);
          self.loaded.attendance = true;
          self.updateStatus();
        });
      },
      updateAttendancesActive() {
        const self = this;
        self.loaded.active = false;
        const otherOptions = {
          others: self.viewOthers,
        };
        return API.getAttendancesActive({otherOptions}).then(data => {
          self.activeData = AttendanceService.prepareAttendance(data, self);
          if (self.activeData !== null) {
            self.loaded.timestamp = self.activeData.timestamp;
          }
          //self.formattedActiveData = TimesheetService.formatAttendanceActive(self.activeData, self);
          self.loaded.active = true;
        });
      },

      updateStatus() {
        const self = this;
        const last_user_attedance = self.attendanceData.find(e => {
          if ((e.user_id = API.actorId)) return true;
        });
        if (last_user_attedance) {
          switch (last_user_attedance.status) {
            case "start":
              self.clock_on = true;
              self.break_on = false;
              break;
            case "stop":
              self.clock_on = false;
              self.break_on = false;
              break;
            case "pause":
              self.clock_on = true;
              self.break_on = true;
              break;
            case "resume":
              self.clock_on = true;
              self.break_on = false;
              break;
            default:
              self.clock_on = false;
              self.break_on = false;
          }
        } else {
          self.clock_on = false;
          self.break_on = false;
        }
      },
      formatDuration() {
        const self = this;
        if (self.activeData !== null) {
          return self.$moment.utc(self.$moment.duration(self.loaded.duration, "hours").asMilliseconds()).format("H:mm:ss");
        }
      },
      calculateDuration() {
        const self = this;
        if (self.activeData !== null) {
          const startTime = self.$moment(self.loaded.timestamp);
          const endTime = self.$moment(new Date());
          const duration = self.$moment.duration(endTime.diff(startTime));
          self.loaded.duration = duration.asHours();
        }
      },

      onPtrRefresh(e) {
        const done = e.detail;
        const self = this;
        self.updateAll()
          .then(() => {
            done();
          });
      },
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off("time_clock:attedance_edit", self.updateAll);
      self.$events.$off("time_clock:attedance_delete", self.updateAll);
      clearInterval(self.loaded.interval);
    },
    mounted() {
      const self = this;


      //self.getAttendancesActive();
      //self.getShiftActive();

      self.loaded.interval = setInterval(() => {
        self.calculateDuration();
      }, 1000); //1minute


      return Promise.all([
        self.$api.getInstalledAddonPermission(
          "time_clock",
          "attendance_other_access",
          {with_filters: true}
        )
      ]).then(v => {
        self.viewOthers = API.checkPermision(v[0], self);
        const otherOptions = {
          others: self.viewOthers,
        };
        API.getAttendances({otherOptions}).then(data => {
          self.attendanceData = AttendanceService.prepareAttendances(data, self);
          //self.formattedAttendanceData = TimesheetService.splitAttendanceIntoDays(self.attendanceData, self);
          self.loaded.attendance = true;
          self.loaded.first = true;
          self.updateStatus();
          self.calculateDuration();
        });
        API.getAttendancesActive({otherOptions}).then(data => {
          self.activeData = AttendanceService.prepareAttendance(data, self);
          if (self.activeData !== null) {
            // self.formattedActiveData = TimesheetService.formatAttendanceActive(self.activeData, self);
            self.loaded.timestamp = self.activeData.timestamp;
          }
          self.loaded.active = true;
        });
      });

      API.getTest().then(data => console.log("TCL: mounted -> TEST", data));


    },

  };
</script>

<style lang="scss">

</style>
