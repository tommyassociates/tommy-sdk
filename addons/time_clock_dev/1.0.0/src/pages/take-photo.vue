<template>
  <f7-page class="time-clock-take-photo" :page-content="false">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{ $t(`${addonConfig.package}.take_photo.title`) }}</f7-nav-title>
    </f7-navbar>

    <!-- v-if="attendances_enable && loaded.first" -->
    <f7-toolbar
      :style="toolbarStyle"
      class="time-clock-main-toolbar"
    >
      <f7-button
        raised
        fill
        v-if="!clock_on"
        @click="clockOnClick"
        class="time-clock-toolbar-button clock-on"
      >{{ $t(`${addonConfig.package}.index.clock_on_button`) }}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on"
        @click="clockOffClick"
        class="time-clock-toolbar-button clock-off"
      >{{ $t(`${addonConfig.package}.index.clock_off_button`) }} {{ formatDuration() }}
      </f7-button>

    </f7-toolbar>
    <f7-page-content>

      <h1 class="time-clock-take-photo__time">{{ timeDisplay }}</h1>
      <h2 class="time-clock-take-photo__date">{{ dayDisplay }}</h2>
      <Geo ref="geo" :dialog="false"/>
    </f7-page-content>
  </f7-page>
</template>

<script>

import addonConfig from "../config";
import config from 'tommy-core/src/tommy';
import API from "../api";
import AttendanceService from "../services/attendance-service";

import Geo from "../components/geo.vue";
import Blob from "../mixins/baseToBlob.vue";

export default {
  name: "TimeClockTakePhoto",
  components: {
    Geo,
  },
  mixins: [Blob],
  data() {
    const self = this;
    return {
      addonConfig,
      timeDisplay: self.$moment().format('h:mm:ss A'),
      dayDisplay: self.$moment().format('dddd, Do MMMM'),
      clock_on: false,
      activeData: [],
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
  mounted() {
    const self = this;

    setInterval(function () {
      // console.log('TimeClockTakePhoto timeout');
      self.timeDisplay = self.$moment().format('h:mm:ss A');
      self.dayDisplay = self.$moment().format('dddd, Do MMM');
    }, 1000);

    if (window.cordova) {
      CameraPreview.startCamera({
        x: 50,
        y: 185,
        width: 220,
        height: 220,
        toBack: false,
        previewDrag: false,
        tapPhoto: true
      });
      CameraPreview.show();
    }

    const otherOptions = {
      others: false,
    };
    API.getAttendances({otherOptions}).then(data => {
      self.attendanceData = AttendanceService.prepareAttendances(data, self);
      self.updateStatus();
    });


  },
  computed: {
    toolbarStyle() {
      const self = this;
      return {
        height: "72px"
      };
    },
  },
  methods: {
    updateStatus() {
      const self = this;
      const last_user_attedance = self.attendanceData.find(e => {
        if ((e.user_id = API.actorId)) return true;
      });
      if (last_user_attedance) {
        switch (last_user_attedance.status) {
          case "start":
            self.clock_on = true;
            break;
          case "stop":
            self.clock_on = false;
            break;
          case "pause":
            self.clock_on = true;
            break;
          case "resume":
            self.clock_on = true;
            break;
          default:
            self.clock_on = false;
        }
      } else {
        self.clock_on = false;
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

    clockOnClick() {
      const self = this;
      console.log('TIME CLOCK: clockOnClick');

      if (window.cordova) {
        self.$f7.preloader.show()
        self.$refs.geo.takeGeoAsync().then(cords => {
          // self.$refs.photo.takePhotoAsync().then(photo => {

          console.log('TAKE_PHOTO: ', JSON.stringify(cords));
          CameraPreview.takePicture({width: 1024, height: 1024, quality: 80}, function (base64PictureData) {
            console.log('TAKE_PHOTO: CameraPreview.takePicture ', JSON.stringify(base64PictureData));
            // CameraPreview.stopCamera();
            CameraPreview.hide();
            console.log('TAKE_PHOTO: After  CameraPreview.stopCamera();');

            const form = new FormData();
            form.append("event_id", API.shifts_active_id);
            form.append("latitude", cords.latitude);
            form.append("longitude", cords.longitude);
            form.append("accuracy", cords.accuracy);
            form.append("status", "start");
            form.append("address", cords.name);
            form.append(
              "image",
              self.dataURLToBlob(base64PictureData),
              `attendance_stop.jpg`
            );

            self.loaded.duration = 0;

            API.setAttendances(form).then(() => {
              self.clock_on = false;
              self.$f7.preloader.hide()
              self.$f7router.navigate(addonConfig.baseUrl);
            });
          }).catch(() => {
            self.$f7.preloader.hide();
          });
        });
      }


      // self.$f7.preloader.show()
      // self.$refs.geo.takeGeoAsync().then(cords => {
      //   self.$refs.photo.takePhotoAsync().then(photo => {
      //     const form = new FormData();
      //     form.append("event_id", API.shifts_active_id);
      //     form.append("latitude", cords.latitude);
      //     form.append("longitude", cords.longitude);
      //     form.append("accuracy", cords.accuracy);
      //     form.append("status", "start");
      //     form.append("address", cords.name);
      //     form.append(
      //       "image",
      //       self.dataURLToBlob(photo),
      //       `attendance_start.jpg`
      //     );
      //
      //     API.setAttendances(form).then(() => {
      //       self.updateAll();
      //       self.clock_on = true;
      //       self.$f7.preloader.hide()
      //     });
      //   }).catch(() => {
      //     self.$f7.preloader.hide();
      //   });
      // });
    },
    clockOffClick() {
      const self = this;

      console.log('TIME CLOCK: clockOffClick');

      if (window.cordova) {


        self.$f7.preloader.show()
        self.$refs.geo.takeGeoAsync().then(cords => {
          // self.$refs.photo.takePhotoAsync().then(photo => {

          console.log('TAKE_PHOTO: ', JSON.stringify(cords));
          CameraPreview.takePicture({width: 1024, height: 1024, quality: 80}, function (base64PictureData) {
            console.log('TAKE_PHOTO: CameraPreview.takePicture ', JSON.stringify(base64PictureData));
            // CameraPreview.stopCamera();
            // CameraPreview.hide();
            console.log('TAKE_PHOTO: After  CameraPreview.stopCamera();');

            const form = new FormData();
            form.append("event_id", API.shifts_active_id);
            form.append("latitude", cords.latitude);
            form.append("longitude", cords.longitude);
            form.append("accuracy", cords.accuracy);
            form.append("status", "stop");
            form.append("address", cords.name);
            form.append(
              "image",
              self.dataURLToBlob(base64PictureData),
              `attendance_stop.jpg`
            );

            self.loaded.duration = 0;

            API.setAttendances(form).then(() => {
              self.clock_on = false;
              self.$f7.preloader.hide()
              self.$f7router.navigate(addonConfig.baseUrl);
            });
          }).catch(() => {
            self.$f7.preloader.hide();
          });
        });
      }
    },
  },
  destroyed() {
    const self = this;
    if (window.cordova) {
      // CameraPreview.stopCamera();
      CameraPreview.hide();
    }
  },
}
</script>

<style scoped>

</style>
