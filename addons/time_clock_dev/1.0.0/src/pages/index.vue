<template>
  <div>
    <template v-if="isLocked">
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
    <template v-else>
      <f7-page class="time-clock-main-page" :page-content="false" ptr @ptr:refresh="onPtrRefresh">
        <f7-navbar>
          <tommy-nav-menu></tommy-nav-menu>
          <f7-nav-title>{{ $t(`${addonConfig.package}.index.title`) }}</f7-nav-title>
          <f7-nav-right class="time-clock-navbar-links">
            <f7-link :href="`${addonConfig.baseUrl}add/`" icon-only>
              <f7-icon f7="plus"/>
            </f7-link>
            <f7-link :href="`${addonConfig.baseUrl}search/`" icon-only>
              <f7-icon f7="search"/>
            </f7-link>
            <f7-link :href="`${addonConfig.baseUrl}settings/`" icon-only v-if="isTeamManager || isAdmin">
              <f7-icon f7="gear"/>
            </f7-link>

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
          >{{ $t(`${addonConfig.package}.index.clock_on_button`) }}
          </f7-button>
          <f7-button
            raised
            fill
            v-if="clock_on && !break_on"
            @click="clockOffClick"
            class="time-clock-toolbar-button clock-off"
          >{{ $t(`${addonConfig.package}.index.clock_off_button`) }} {{ formatDuration() }}
          </f7-button>
          <f7-button
            raised
            fill
            v-if="clock_on && !break_on"
            @click="breakOnClick"
            class="time-clock-toolbar-button break-on"
          >{{ $t(`${addonConfig.package}.index.break_on_button`) }}
          </f7-button>
          <f7-button
            raised
            fill
            v-if="break_on"
            @click="breakOffClick"
            class="time-clock-toolbar-button break-off"
          >{{ $t(`${addonConfig.package}.index.break_off_button`) }} {{ formatDuration() }}
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
  </div>
</template>
<script>
import addonConfig from "../addonConfig";
import API from "../api";
import AttendanceService from "../services/attendance-service";

import ActiveAvatar from "../components/circle-avatar.vue";
import Events from "../components/events.vue";
import Photo from 'tommy-core/src/components/photo.vue';
import CircleAvatar from 'tommy-core/src/components/circle-avatar';
import Geo from "../components/geo.vue";
import Blob from "../mixins/baseToBlob.vue";

import {mapGetters, mapState} from 'vuex';

/*
TODO: add shift empty page

*/
export default {
  name: "TimeClock",
  data() {
    return {
      addonConfig,
      viewOthers: false,
      clock_on: false,
      break_on: false,
      activeData: [],
      attendanceData: [],
      userId: this.$f7route.query.user_id,
      loaded: {
        first: false,
        active: false,
        attendance: false,
        duration: 0,
        timestamp: false,
        interval: false
      },
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

    API.actorId = API.getUserId(this);
    API.actor = API.getActor(this);

    if (!this.isLocked) {
      this.$events.$on(`${this.addonConfig.package}:attedance_edit`, this.updateAll);
      this.$events.$on(`${this.addonConfig.package}:attedance_delete`, this.updateAll);
    }

    // if (this.$root.miniProgramLocked.isLocked === true && this.$root.miniProgramLocked.miniProgram === this.addonConfig.package) {
    //   this.$f7router.navigate(`${this.addonConfig.baseUrl}locked/enter-pin`);
    // }
  },
  computed: {
    ...mapGetters('teamMembers', ['teamMember']),
    ...mapState('teamMembers', ['teamMembers']),
    ...mapGetters('account', ['isTeamManager', 'isAdmin']),
    pageContentStyle() {
      if (this.clock_on && !this.break_on) {
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
      if (this.clock_on && !this.break_on) {
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
      return AttendanceService.splitAttendanceIntoDays(this.attendanceData, this);
    },
    formattedActiveData() {
      return AttendanceService.formatAttendanceActive(this.activeData, this);
    },

    previewUser() {
      return this.teamMember(this.userId);
    },

    isLocked() {
      return this.$store.state.miniProgramLocked.isLocked
        && this.$store.state.miniProgramLocked.miniProgram === addonConfig.package;
    },
  },
  methods: {
    // addonConfig() {
    //   return addonConfig;
    // },
    clockOnClick() {

      // console.log('TIME CLOCK: clockOnClick');
      this.$f7.preloader.show()
      if (window.cordova) {

        this.$refs.geo.takeGeoAsync().then(cords => {
          this.$refs.photo.takePhotoAsync().then(photo => {
            const form = new FormData();
            if (this.isLocked) {
              form.append('user_id', this.userId);
              form.append('actor_id', API.actorId);
            }
            form.append("event_id", API.shifts_active_id);
            form.append("latitude", cords.latitude);
            form.append("longitude", cords.longitude);
            form.append("accuracy", cords.accuracy);
            form.append("status", "start");
            form.append("address", cords.name);
            form.append(
              "image",
              this.dataURLToBlob(photo),
              `attendance_start.jpg`
            );

            const isManager = this.isLocked;
            API.setAttendances(form, isManager).then(() => {
              this.updateAll();
              this.clock_on = true;
              this.$f7.preloader.hide();

              if (this.isLocked) {
                const redirect = `${addonConfig.baseUrl}confirmation/`;
                this.$f7router.navigate(redirect);
              }
            });
          }).catch(() => {
            this.$f7.preloader.hide();
          });
        });
      } else {
        this.$refs.geo.takeGeoAsync().then(cords => {
          const form = new FormData();
          if (this.isLocked) {
            form.append('user_id', this.userId);
            form.append('actor_id', API.actorId);
          }
          form.append("event_id", API.shifts_active_id);
          form.append("latitude", cords.latitude);
          form.append("longitude", cords.longitude);
          form.append("accuracy", cords.accuracy);
          form.append("status", "start");
          form.append("address", cords.name);

          const isManager = this.isLocked;
          API.setAttendances(form, isManager).then(() => {
            this.updateAll();
            this.clock_on = true;
            this.$f7.preloader.hide();

            if (this.isLocked) {
              const redirect = `${addonConfig.baseUrl}confirmation/`;
              this.$f7router.navigate(redirect);
            }
          });
        });
      }
    },
    clockOffClick() {

      // console.log('TIME CLOCK: clockOffClick');
      this.$f7.preloader.show()
      if (window.cordova) {
        this.$refs.geo.takeGeoAsync().then(cords => {
          this.$refs.photo.takePhotoAsync().then(photo => {
            const form = new FormData();
            if (this.isLocked) {
              form.append('user_id', this.userId);
              form.append('actor_id', API.actorId);
            }
            form.append("event_id", API.shifts_active_id);
            form.append("latitude", cords.latitude);
            form.append("longitude", cords.longitude);
            form.append("accuracy", cords.accuracy);
            form.append("status", "stop");
            form.append("address", cords.name);
            form.append(
              "image",
              this.dataURLToBlob(photo),
              `attendance_stop.jpg`
            );

            this.loaded.duration = 0;
            const isManager = this.isLocked;
            API.setAttendances(form, isManager).then(() => {
              this.updateAll();
              this.clock_on = false;
              this.$f7.preloader.hide();

              if (this.isLocked) {
                const redirect = `${addonConfig.baseUrl}confirmation/`;
                this.$f7router.navigate(redirect);
              }
            });
          })
        }).catch(() => {
          this.$f7.preloader.hide();
        });
      } else {
        this.$refs.geo.takeGeoAsync().then(cords => {

          const form = new FormData();
          if (this.isLocked) {
            form.append('user_id', this.userId);
            form.append('actor_id', API.actorId);
          }
          form.append("event_id", API.shifts_active_id);
          form.append("latitude", cords.latitude);
          form.append("longitude", cords.longitude);
          form.append("accuracy", cords.accuracy);
          form.append("status", "stop");
          form.append("address", cords.name);

          this.loaded.duration = 0;
          const isManager = this.isLocked;
          API.setAttendances(form, isManager).then(() => {
            this.updateAll();
            this.clock_on = false;
            this.$f7.preloader.hide();

            if (this.isLocked) {
              const redirect = `${addonConfig.baseUrl}confirmation/`;
              this.$f7router.navigate(redirect);
            }
          });
        })
      }
    },
    breakOnClick() {
      this.$refs.geo.takeGeoAsync().then(cords => {
        const params = {
          event_id: API.shifts_active_id,
          latitude: cords.latitude,
          longitude: cords.longitude,
          accuracy: cords.accuracy,
          status: "pause",
          address: cords.name
        };

        if (this.isLocked) {
          params.user_id = this.userId;
          params.actor_id = API.actorId;
        }

        this.loaded.duration = 0;
        this.loaded.timestamp = this.$moment(new Date()).format();
        const isManager = this.isLocked;
        API.setAttendances(params, isManager).then(() => {
          this.updateAttendances();
          this.break_on = true;

          if (this.isLocked) {
            const redirect = `${addonConfig.baseUrl}confirmation/`;
            this.$f7router.navigate(redirect);
          }
        });
      });
    },
    breakOffClick() {
      this.$refs.geo.takeGeoAsync().then(cords => {
        const params = {
          event_id: API.shifts_active_id,
          latitude: cords.latitude,
          longitude: cords.longitude,
          accuracy: cords.accuracy,
          status: "resume",
          address: cords.name
        };

        if (this.isLocked) {
          params.user_id = this.userId;
          params.actor_id = API.actorId;
        }

        this.loaded.duration = 0;
        //set back to the attendance timestamp
        this.loaded.timestamp = this.$moment(this.activeData.timestamp).format();
        const isManager = this.isLocked;
        API.setAttendances(params, isManager).then(() => {
          this.updateAttendances();
          this.break_on = false;

          if (this.isLocked) {
            const redirect = `${addonConfig.baseUrl}confirmation/`;
            this.$f7router.navigate(redirect);
          }
        });
      });
    },

    updateAll() {
      return this.updateAttendances().then(() => {
        return this.updateAttendancesActive();
      });

    },
    updateAttendances() {
      this.loaded.attendance = false;
      const otherOptions = {
        others: this.viewOthers,
      };
      return API.getAttendances({otherOptions}).then(data => {
        this.attendanceData = AttendanceService.prepareAttendances(data, this);
        this.loaded.attendance = true;
        this.updateStatus();
      });
    },
    updateAttendancesActive() {
      this.loaded.active = false;
      const otherOptions = {
        others: this.viewOthers,
      };
      return API.getAttendancesActive({otherOptions}).then(data => {
        this.activeData = AttendanceService.prepareAttendance(data, this);
        if (this.activeData !== null) {
          this.loaded.timestamp = this.activeData.timestamp;
        }
        //this.formattedActiveData = TimesheetService.formatAttendanceActive(this.activeData, this);
        this.loaded.active = true;
      });
    },

    updateStatus() {
      let last_user_attedance = null;
      if (this.isLocked) {
        [last_user_attedance] = this.attendanceData;
      } else {
        last_user_attedance = this.attendanceData.find(e => {
          if ((e.user_id = API.actorId)) return true;
        });
      }
      if (last_user_attedance) {
        switch (last_user_attedance.status) {
          case "start":
            this.clock_on = true;
            this.break_on = false;
            break;
          case "stop":
            this.clock_on = false;
            this.break_on = false;
            break;
          case "pause":
            this.clock_on = true;
            this.break_on = true;
            break;
          case "resume":
            this.clock_on = true;
            this.break_on = false;
            break;
          default:
            this.clock_on = false;
            this.break_on = false;
        }
      } else {
        this.clock_on = false;
        this.break_on = false;
      }
    },
    formatDuration() {
      if (this.activeData !== null) {
        return this.$moment.utc(this.$moment.duration(this.loaded.duration, "hours").asMilliseconds()).format("H:mm:ss");
      }
    },
    calculateDuration() {
      if (this.activeData !== null) {
        // console.log('this.loaded.timestamp', this.loaded.timestamp);
        if (this.loaded.timestamp !== false) {
          const startTime = this.$moment(this.loaded.timestamp);
          const endTime = this.$moment(new Date());
          const duration = this.$moment.duration(endTime.diff(startTime));
          this.loaded.duration = duration.asHours();
        }
      }
    },

    onPtrRefresh(e) {
      const done = e.detail;
      this.updateAll()
        .then(() => {
          done();
        });
    },
  },
  beforeDestroy() {
    if (!this.isLocked) {
      this.$events.$off(`${this.addonConfig.package}:attedance_edit`, this.updateAll);
      this.$events.$off(`${this.addonConfig.package}:attedance_delete`, this.updateAll);
    }
    clearInterval(this.loaded.interval);
  },
  mounted() {

    if (this.isLocked) {
      this.viewOthers = true;

      const otherOptions = {
        limit: 1,
        user_id: this.userId,
      };
      const isManager = true;

      API.getAttendances({otherOptions, isManager, others: this.viewOthers}).then(data => {
        this.attendanceData = AttendanceService.prepareAttendances(data, this);
        //this.formattedAttendanceData = TimesheetService.splitAttendanceIntoDays(this.attendanceData, this);
        this.loaded.attendance = true;
        this.loaded.first = true;

        if (this.attendanceData && this.attendanceData.length === 1) {
          if (['start', 'pause', 'resume'].includes(this.attendanceData[0].status)) {
            this.loaded.timestamp = this.attendanceData[0].timestamp;
          }

          this.loaded.interval = setInterval(() => {
            this.calculateDuration();
          }, 1000); //1minute
          this.calculateDuration();
        }
        this.updateStatus();

      });
    } else {

      this.loaded.interval = setInterval(() => {
        this.calculateDuration();
      }, 1000);

      return Promise.all([
        this.$api.getInstalledAddonPermission(
          this.addonConfig.package,
          "attendance_other_access",
          {with_filters: true}
        )
      ]).then(v => {
        // console.log('TIMECLOCK - mounted - promise then');
        this.viewOthers = API.checkPermision(v[0], this);
        const otherOptions = {
          others: this.viewOthers,
        };
        // console.log('TIMECLOCK - mounted promise then other options', JSON.stringify(otherOptions));
        API.getAttendances({otherOptions}).then(data => {
          console.log('TIMECLOCK - mounted promise get attendances');
          // console.log('TIMECLOCK - mounted promise get attendances - data', JSON.stringify(data));
          this.attendanceData = AttendanceService.prepareAttendances(data, this);
          //this.formattedAttendanceData = TimesheetService.splitAttendanceIntoDays(this.attendanceData, this);
          this.loaded.attendance = true;
          this.loaded.first = true;
          // console.log('TIMECLOCK - mounted promise get attendances - before update status');
          this.updateStatus();
          // console.log('TIMECLOCK - mounted promise get attendances - before calculateDuration');
          this.calculateDuration();
          // console.log('TIMECLOCK - mounted promise get attendances - after calculateDuration');
        });
        API.getAttendancesActive({otherOptions}).then(data => {
          // console.log('TIMECLOCK - mounted promise get active attendances');
          this.activeData = AttendanceService.prepareAttendance(data, this);
          if (this.activeData !== null) {
            // this.formattedActiveData = TimesheetService.formatAttendanceActive(this.activeData, this);
            this.loaded.timestamp = this.activeData.timestamp;
          }
          this.loaded.active = true;
        });
      });
    }
  },

};
</script>

<style lang="scss">

</style>
