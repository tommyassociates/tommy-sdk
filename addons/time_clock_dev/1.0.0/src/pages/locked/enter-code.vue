<template>
  <f7-page class="time-clock-settings-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{ $t(`${addonConfig.package}.locked.enter_code.title`) }}</f7-nav-title>
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
        :disabled="!submitCodeValid()"
      >{{ $t(`${addonConfig.package}.index.clock_on_button`) }}
      </f7-button>
      <f7-button
        raised
        fill
        v-if="clock_on"
        @click="clockOffClick"
        class="time-clock-toolbar-button clock-off"
        :disabled="!submitCodeValid()"
      >{{ $t(`${addonConfig.package}.index.clock_off_button`) }} {{ formatDuration() }}
      </f7-button>

    </f7-toolbar>

    <f7-page-content ref="pageContent">


      <h1 class="time-clock-take-photo__time">{{ timeDisplay }}</h1>
      <h2 class="time-clock-take-photo__date">{{ dayDisplay }}</h2>
      <h3>{{ $t(`${addonConfig.package}.locked.enter_code.description`) }}</h3>

      <f7-row>
        <f7-col>
          <button @click="enterCodeNumber(1)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.one`) }}
          </button>
        </f7-col>
        <f7-col>
          <button @click="enterCodeNumber(2)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.two`) }}
          </button>
        </f7-col>
        <f7-col>
          <button @click="enterCodeNumber(3)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.three`) }}
          </button>
        </f7-col>
      </f7-row>

      <f7-row>
        <f7-col>
          <button @click="enterCodeNumber(4)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.four`) }}
          </button>
        </f7-col>
        <f7-col>
          <button @click="enterCodeNumber(5)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.five`) }}
          </button>
        </f7-col>
        <f7-col>
          <button @click="enterCodeNumber(6)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.six`) }}
          </button>
        </f7-col>
      </f7-row>

      <f7-row>
        <f7-col>
          <button @click="enterCodeNumber(7)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.seven`) }}
          </button>
        </f7-col>
        <f7-col>
          <button @click="enterCodeNumber(8)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.eight`) }}
          </button>
        </f7-col>
        <f7-col>
          <button @click="enterCodeNumber(9)">
            {{ $t(`${addonConfig.package}.locked.enter_code.keypad.nine`) }}
          </button>
        </f7-col>
      </f7-row>


    </f7-page-content>


  </f7-page>
</template>

<script>
import addonConfig from "../../config";

export default {
  name: "TimeclockLockedEnterCode",
  components: {},
  created() {

  },
  computed: {
    toolbarStyle() {
      const self = this;
      return {
        height: "72px"
      };
    },
    submitCodeValid() {
      const self = this;
      return self.code.length === 4;
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
    enterCodeNumber(number) {

    },
  },
  data() {
    return {
      addonConfig,
      timeDisplay: self.$moment().format('h:mm:ss A'),
      dayDisplay: self.$moment().format('dddd, Do MMMM'),
      code: '',
    };
  }
};
</script>
