<template>
  <f7-page class="time-clock-settings-page">
    <f7-navbar>
      <f7-nav-title>{{ $t(`${addonConfig.package}.locked.enter_pin.title`) }}</f7-nav-title>
      <f7-nav-right>
        <!--        <f7-link icon-only class="back">-->
        <!--          <f7-icon f7="check" />-->
        <!--        </f7-link>-->
      </f7-nav-right>
    </f7-navbar>

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
        :disabled="!submitPinValid"
      >{{ $t(`${addonConfig.package}.index.clock_on_button`) }}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on"
        @click="clockOffClick"
        class="time-clock-toolbar-button clock-off"
        :disabled="!submitPinValid"
      >{{ $t(`${addonConfig.package}.index.clock_off_button`) }} {{ formatDuration() }}
      </f7-button>

    </f7-toolbar>

    <f7-page-content ref="pageContent">

      <f7-block>
        <h1 class="time-clock-take-photo__time">{{ timeDisplay }}</h1>
        <h2 class="time-clock-take-photo__date">{{ dayDisplay }}</h2>
        <h3 class="time-clock-take-photo__description">{{
            $t(`${addonConfig.package}.locked.enter_pin.description`)
          }}</h3>

        <f7-row class="padding-bottom">
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(1)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.one`) }}
            </button>
          </f7-col>
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(2)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.two`) }}
            </button>
          </f7-col>
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(3)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.three`) }}
            </button>
          </f7-col>
        </f7-row>

        <f7-row class="padding-bottom">
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(4)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.four`) }}
            </button>
          </f7-col>
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(5)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.five`) }}
            </button>
          </f7-col>
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(6)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.six`) }}
            </button>
          </f7-col>
        </f7-row>

        <f7-row class="padding-bottom">
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(7)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.seven`) }}
            </button>
          </f7-col>
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(8)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.eight`) }}
            </button>
          </f7-col>
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(9)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.nine`) }}
            </button>
          </f7-col>
        </f7-row>

        <f7-row class="padding-bottom">
          <f7-col class="text-align-center">
            <button @click="deletePinNumber()"
                    class="time-clock__numeric-button time-clock__numeric-button--small-text">
              CLEAR
            </button>
          </f7-col>
          <f7-col class="text-align-center">
            <button @click="enterPinNumberDigit(0)" class="time-clock__numeric-button">
              {{ $t(`${addonConfig.package}.locked.enter_pin.keypad.zero`) }}
            </button>
          </f7-col>
          <f7-col class="text-align-center">
            <button @click="deletePinNumberDigit()"
                    class="time-clock__numeric-button time-clock__numeric-button--small-text">
              <backspace-icon/>
            </button>
          </f7-col>
        </f7-row>

        <div class="time-clock__entered-code">
          <f7-row>
            <f7-col class="text-align-center">{{ pinPreview[0] }}</f7-col>
            <f7-col class="text-align-center">{{ pinPreview[1] }}</f7-col>
            <f7-col class="text-align-center">{{ pinPreview[2] }}</f7-col>
            <f7-col class="text-align-center">{{ pinPreview[3] }}</f7-col>
          </f7-row>
        </div>

      </f7-block>
    </f7-page-content>


  </f7-page>
</template>

<script>
import addonConfig from "../../addonConfig";
import API from "../../api";
import backspaceIcon from '../../components/icons/backspace-icon';

export default {
  name: "TimeclockLockedEnterPin",
  components: {
    backspaceIcon,
  },
  created() {

  },
  computed: {
    toolbarStyle() {
      const self = this;
      return {
        height: "72px"
      };
    },
    submitPinValid() {
      const self = this;
      return self.pin.length === 4;
    }
  },
  mounted() {
    const self = this;

    setInterval(function () {
      // console.log('TimeClockTakePhoto timeout');
      self.timeDisplay = self.$moment().format('h:mm:ss A');
      self.dayDisplay = self.$moment().format('dddd, Do MMM');
    }, 1000);
  },
  methods: {
    enterPinNumberDigit(number) {
      const self = this;
      if (self.pin.length < 4) {
        self.pin.push(number);
        self.pinPreview.push(number);
        setTimeout(() => {
          self.pin.forEach((val, index) => {
            self.pinPreview[index] = '*';
          });

        }, 500);
      }
    },
    deletePinNumberDigit() {
      const self = this;
      self.pin.pop();
      self.pinPreview.pop();
    },
    deletePinNumber() {
      const self = this;
      self.pin = [];
      self.pinPreview = [];
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

      API.verifyPin(self.pin.toString()).then((response) => {
        console.log(response);
      });

      // console.log('TIME CLOCK: clockOnClick');
      //
      // if (window.cordova) {
      //   self.$f7.preloader.show()
      //   self.$refs.geo.takeGeoAsync().then(cords => {
      //     // self.$refs.photo.takePhotoAsync().then(photo => {
      //
      //     console.log('TAKE_PHOTO: ', JSON.stringify(cords));
      //     CameraPreview.takePicture({width: 1024, height: 1024, quality: 80}, function (base64PictureData) {
      //       console.log('TAKE_PHOTO: CameraPreview.takePicture ', JSON.stringify(base64PictureData));
      //       // CameraPreview.stopCamera();
      //       CameraPreview.hide();
      //       console.log('TAKE_PHOTO: After  CameraPreview.stopCamera();');
      //
      //       const form = new FormData();
      //       form.append("event_id", API.shifts_active_id);
      //       form.append("latitude", cords.latitude);
      //       form.append("longitude", cords.longitude);
      //       form.append("accuracy", cords.accuracy);
      //       form.append("status", "start");
      //       form.append("address", cords.name);
      //       form.append(
      //         "image",
      //         self.dataURLToBlob(base64PictureData),
      //         `attendance_stop.jpg`
      //       );
      //
      //       self.loaded.duration = 0;
      //
      //       API.setAttendances(form).then(() => {
      //         self.clock_on = false;
      //         self.$f7.preloader.hide()
      //         self.$f7router.navigate(addonConfig.baseUrl);
      //       });
      //     }).catch(() => {
      //       self.$f7.preloader.hide();
      //     });
      //   });
      // }


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
  data() {
    const self = this;
    return {
      addonConfig,
      timeDisplay: self.$moment().format('h:mm:ss A'),
      dayDisplay: self.$moment().format('dddd, Do MMMM'),
      pin: [],
      pinPreview: [],
      clock_on: false,
    };
  }
};
</script>
