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
    <f7-toolbar :style="toolbarStyle" class="time-clock-main-toolbar">
      <f7-button raised fill v-if="!clock_on && !break_on" @click="clockOnClick" class="time-clock-toolbar-button clock-on">{{$t('time_clock.index.clock_on_button')}}</f7-button>
      <f7-button raised fill v-if="clock_on && !break_on" @click="clockOffClick" class="time-clock-toolbar-button clock-off">{{$t('time_clock.index.clock_off_button')}}</f7-button>
      <f7-button raised fill v-if="clock_on && !break_on" @click="breakOnClick" class="time-clock-toolbar-button break-on">{{$t('time_clock.index.break_on_button')}}</f7-button>
      <f7-button raised fill v-if="break_on" @click="breakOffClick" class="time-clock-toolbar-button break-off">{{$t('time_clock.index.break_off_button')}}</f7-button>
    </f7-toolbar>
    <f7-page-content :style="pageContentStyle">
      <f7-block-title class="time-clock-divider">{{$t('time_clock.index.active_title')}}</f7-block-title>
      <!--Active -->
      <div class="time-clock-active" v-if="clock_on">
        <f7-list media-list class="time-clock-list">
          <Events 
            :data="active_data"
            :active="true"
          />
        </f7-list>
      </div>
      <div class="time-clock-active" v-if="!clock_on">      
        <div class="time-clock-avatars-container">
          <Active-avatar :data="team_data"/>
        </div>
      </div>
      <f7-block-title class="time-clock-divider">{{$t('time_clock.index.today_title')}}</f7-block-title>
      <!--Events -->
      <Events 
        :data="events_data"
      />
    </f7-page-content>
    <CameraPopup ref="cameraPopup" :geolocation="true" @camera:send="getPhotoCamera" @popup:close="popupCameraClose"/>
  </f7-page>
</template>
<script>
import API from "../api";
import ActiveAvatar from "../components/circle-avatar.vue";
import Events from "../components/events.vue";
import CameraPopup from "../components/take-photo.vue";

export default {
  name: 'TimeClock',
  components:{
    ActiveAvatar,
    Events,
    CameraPopup,
  },
  data() {
    const self = this;
    return {
      clock_on: false,
      break_on: false,
      active_data: [],
      events_data: [],
      team_data: [],
    };
  },
  created() {
    const self = this;
  },
  computed: {
    pageContentStyle(){
      const self = this;
      if (self.clock_on && !self.break_on){
        return {
          paddingBottom: "136px"
        }
      }else{
        return {
          paddingBottom: "74px"
        }
      }
    },
    toolbarStyle(){
      const self = this;
      if (self.clock_on && !self.break_on){
        return {
          height: "136px"
        }
      }else{
        return {
          height: "74px"
        }
      }
    }
  },
  methods: {
    getPhotoCamera(photo){

    },
    clockOnClick(){
      const self = this;
      self.$refs.cameraPopup.open();
      self.$refs.cameraPopup.$once('camera:send', ()=>{self.clock_on = true;})
    },
    clockOffClick(){
      const self = this;
      self.$refs.cameraPopup.open();
      self.$refs.cameraPopup.$once('camera:send', ()=>{self.clock_on = false;})
    },
    breakOnClick(){
      const self = this;
      self.$refs.cameraPopup.open();
      self.$refs.cameraPopup.$once('camera:send', ()=>{self.break_on = true;})
    },
    breakOffClick(){
      const self = this;
      self.$refs.cameraPopup.open();
      self.$refs.cameraPopup.$once('camera:send', ()=>{self.break_on = false;})
    },
    popupCameraClose(){
      self.$refs.cameraPopup.$off('camera:send');
    }
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
    API.activeGet().then(data => self.active_data = data);
    API.teamGet().then(data => self.team_data = data);
    API.eventsGet().then(data => self.events_data = data);
  }
};
</script>

