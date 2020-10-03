<template>
  <f7-page class="time-clock-main-page" :page-content="false">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{ $t(`${addonConfig.package}.locked.take_photo.title`) }}</f7-nav-title>


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
      >{{ $t(`${addonConfig.package}.locked.take_photo.clock_on_button`) }}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on && !break_on"
        @click="clockOffClick"
        class="time-clock-toolbar-button clock-off"
      >{{ $t(`${addonConfig.package}.locked.take_photo.clock_off_button`) }} {{ formatDuration() }}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on && !break_on"
        @click="breakOnClick"
        class="time-clock-toolbar-button break-on"
      >{{ $t(`${addonConfig.package}.locked.take_photo.break_on_button`) }}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="break_on"
        @click="breakOffClick"
        class="time-clock-toolbar-button break-off"
      >{{ $t(`${addonConfig.package}.locked.take_photo.break_off_button`) }} {{ formatDuration() }}
      </f7-button>
    </f7-toolbar>
    <f7-page-content :style="pageContentStyle">


      <div class="text-align-center" style="padding: 40px;">
        <circle-avatar :size="100" :displayImage="true" :data="previewUser"></circle-avatar>
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
import addonConfig from "../../addonConfig";
import API from "../../api";
import AttendanceService from "../../services/attendance-service";

import ActiveAvatar from "../../components/circle-avatar.vue";
import Events from "../../components/events.vue";
import Photo from 'tommy-core/src/components/photo.vue';
import CircleAvatar from 'tommy-core/src/components/circle-avatar';
import Geo from "../../components/geo.vue";
import Blob from "../../mixins/baseToBlob.vue";

import {mapGetters, mapState} from 'vuex';

/*
TODO: add shift empty page

*/
export default {
  name: "TimeClockLockedTakePhoto",
  data() {
    const self = this;
    return {
      addonConfig,
      viewOthers: false,
      clock_on: false,
      break_on: false,
      activeData: [],
      attendanceData: [],
      userId: self.$f7route.query.user_id,
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
    Geo,
    CircleAvatar
  },
  mixins: [Blob],
  created() {
    const self = this;
    API.actor = API.getActor(self);
    // self.$events.$on(`${self.addonConfig.package}:attedance_edit`, self.updateAll);
    // self.$events.$on(`${self.addonConfig.package}:attedance_delete`, self.updateAll);

    // if (self.$root.miniProgramLocked.isLocked === true && self.$root.miniProgramLocked.miniProgram === self.addonConfig.package) {
    //   self.$f7router.navigate(`${self.addonConfig.baseUrl}locked/enter-pin`);
    // }
  },
  computed: {
    ...mapGetters('teamMembers', ['teamMember']),
    ...mapState('teamMembers', ['teamMembers']),
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
    // formattedActiveData() {
    //   const self = this;
    //   return AttendanceService.formatAttendanceActive(self.activeData, self);
    // },
    previewUser() {
      const self = this;
      return self.teamMember(self.userId);
    },
  },
  methods: {
    clockOnClick() {
      const self = this;
      // console.log('TIME CLOCK: clockOnClick');
      // console.log('TIME CLOCK: userId', self.userId);
      // console.log('TIME CLOCK: actorId', API.actorId);
      // console.log('TIME CLOCK: actor_type', 'User');
      self.$f7.preloader.show()
      if (window.cordova) {

        self.$refs.geo.takeGeoAsync().then(cords => {
          self.$refs.photo.takePhotoAsync().then(photo => {
            const form = new FormData();
            form.append('user_id', self.userId);
            form.append('actor_id', API.actorId);
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

            API.setAttendances(form, true).then(() => {
              self.updateAll();
              self.clock_on = true;
              self.$f7.preloader.hide();

              const redirect = `${addonConfig.baseUrl}locked/confirmation/`;
              self.$f7router.navigate(redirect);

            });
          }).catch(() => {
            self.$f7.preloader.hide();
          });
        });
      } else {
        self.$refs.geo.takeGeoAsync().then(cords => {
          const form = new FormData();
          form.append('user_id', self.userId);
          form.append('actor_id', API.actorId);
          form.append("event_id", API.shifts_active_id);
          form.append("latitude", cords.latitude);
          form.append("longitude", cords.longitude);
          form.append("accuracy", cords.accuracy);
          form.append("status", "start");
          form.append("address", cords.name);

          API.setAttendances(form, true).then(() => {
            self.updateAll();
            self.clock_on = true;
            self.$f7.preloader.hide();

            const redirect = `${addonConfig.baseUrl}locked/confirmation/`;
            self.$f7router.navigate(redirect);
          });
        });
      }
    },
    clockOffClick() {
      const self = this;

      // console.log('TIME CLOCK: clockOffClick');
      self.$f7.preloader.show()
      if (window.cordova) {
        self.$refs.geo.takeGeoAsync().then(cords => {
          self.$refs.photo.takePhotoAsync().then(photo => {
            const form = new FormData();
            form.append('user_id', self.userId);
            form.append('actor_id', API.actorId);
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

            API.setAttendances(form, true).then(() => {
              self.updateAll();
              self.clock_on = false;
              self.$f7.preloader.hide();

              const redirect = `${addonConfig.baseUrl}locked/confirmation/`;
              self.$f7router.navigate(redirect);
            });
          })
        }).catch(() => {
          self.$f7.preloader.hide();
        });
      } else {
        self.$refs.geo.takeGeoAsync().then(cords => {

          const form = new FormData();
          form.append('user_id', self.userId);
          form.append('actor_id', API.actorId);
          form.append("event_id", API.shifts_active_id);
          form.append("latitude", cords.latitude);
          form.append("longitude", cords.longitude);
          form.append("accuracy", cords.accuracy);
          form.append("status", "stop");
          form.append("address", cords.name);

          self.loaded.duration = 0;

          API.setAttendances(form, true).then(() => {
            self.updateAll();
            self.clock_on = false;
            self.$f7.preloader.hide();

            const redirect = `${addonConfig.baseUrl}locked/confirmation/`;
            self.$f7router.navigate(redirect);
          });
        })
      }
    },
    breakOnClick() {
      const self = this;
      self.$refs.geo.takeGeoAsync().then(cords => {
        const params = {
          user_id: self.userId,
          actor_id: API.actorId,
          event_id: API.shifts_active_id,
          latitude: cords.latitude,
          longitude: cords.longitude,
          accuracy: cords.accuracy,
          status: "pause",
          address: cords.name
        };

        self.loaded.duration = 0;
        self.loaded.timestamp = self.$moment(new Date()).format();

        API.setAttendances(params, true).then(() => {
          self.updateAttendances();
          self.break_on = true;

          const redirect = `${addonConfig.baseUrl}locked/confirmation/`;
          self.$f7router.navigate(redirect);
        });
      });
    },
    breakOffClick() {
      const self = this;
      self.$refs.geo.takeGeoAsync().then(cords => {
        const params = {
          user_id: self.userId,
          actor_id: API.actorId,
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

        API.setAttendances(params, true).then(() => {
          self.updateAttendances();
          self.break_on = false;

          const redirect = `${addonConfig.baseUrl}locked/confirmation/`;
          self.$f7router.navigate(redirect);
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
      // const last_user_attedance = self.attendanceData.find(e => {
      //   if ((e.user_id = API.actorId)) return true;
      // });
      const [last_user_attedance] = self.attendanceData;

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
        // console.log('self.loaded.timestamp', self.loaded.timestamp);
        if (self.loaded.timestamp !== false) {
          const startTime = self.$moment(self.loaded.timestamp);
          const endTime = self.$moment(new Date());
          const duration = self.$moment.duration(endTime.diff(startTime));
          self.loaded.duration = duration.asHours();
        }
      }
    },


  },
  beforeDestroy() {
    const self = this;
    // self.$events.$off(`${self.addonConfig.package}:attedance_edit`, self.updateAll);
    // self.$events.$off(`${self.addonConfig.package}:attedance_delete`, self.updateAll);
    // clearInterval(self.loaded.interval);
  },
  mounted() {
    const self = this;

    // console.log('TAKE-PHOTO - mounted');
    // console.log(self.$store);
    // console.log('TIME_CLOCK - actor');
    // console.log(self.actor);

    //self.getAttendancesActive();
    //self.getShiftActive();




    // console.log('TAKE-PHOTO - mounted');
    // return Promise.all([
    //   self.$api.getInstalledAddonPermission(
    //     self.addonConfig.package,
    //     "attendance_other_access",
    //     {with_filters: true}
    //   )
    // ]).then(v => {
    // console.log('TAKE-PHOTO - mounted - promise then');
    // self.viewOthers = API.checkPermision(v[0], self);
    self.viewOthers = true;


    const otherOptions = {
      limit: 1,
      user_id: self.userId,
    };
    const isManager = true;

    API.getAttendances({otherOptions, isManager, others: self.viewOthers}).then(data => {
      self.attendanceData = AttendanceService.prepareAttendances(data, self);
      //self.formattedAttendanceData = TimesheetService.splitAttendanceIntoDays(self.attendanceData, self);
      self.loaded.attendance = true;
      self.loaded.first = true;

      if (self.attendanceData && self.attendanceData.length === 1) {
        if (['start', 'pause', 'resume'].includes(self.attendanceData[0].status)) {
          self.loaded.timestamp = self.attendanceData[0].timestamp;
        }

        self.loaded.interval = setInterval(() => {
          self.calculateDuration();
        }, 1000); //1minute
        self.calculateDuration();
      }
      self.updateStatus();

    });
    // API.getAttendancesActive({otherOptions, isManager}).then(data => {
    //   console.log('TAKE-PHOTO - mounted promise get active attendances');
    //   self.activeData = AttendanceService.prepareAttendance(data, self);
    //   if (self.activeData !== null) {
    //     // self.formattedActiveData = TimesheetService.formatAttendanceActive(self.activeData, self);
    //     self.loaded.timestamp = self.activeData.timestamp;
    //   }
    //   self.loaded.active = true;
    // });
    // });

    // API.getTest().then(data => console.log("TCL: mounted -> TEST", data));

  },

};
</script>

<style lang="scss">

</style>



