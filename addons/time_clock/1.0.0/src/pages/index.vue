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
      <Photo ref="photo" direction="front"/>
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

export default {
  name: 'TimeClock',
  components:{
    ActiveAvatar,
    Events,
    Photo,
    Geo
  },
  data() {
    const self = this;
    return {
      clock_on: false,
      break_on: false,
      active_data: [],
      events_data: [],
      team_data: [],
      actorId: self.$f7route.query.actor_id,
    };
  },
  created() {
    const self = this;
    if (self.actorId) {
      API.actorId = parseInt(self.actorId, 10);
      API.actor = self.actor;
    } else {
      delete API.actorId;
      delete API.actor;
    }
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
    clockOnClick(){
      const self = this;
      self.$refs.photo.takePhoto();
      self.$refs.geo.takeGeo();
      self.$refs.photo.$once('photo:send', (photo)=>{self.clock_on = true;})
    },
    clockOffClick(){
      const self = this;
      self.$refs.photo.takePhoto();
      self.$refs.geo.takeGeo();
      self.$refs.photo.$once('photo:send', (photo)=>{self.clock_on = false;})
    },
    breakOnClick(){
      const self = this;
      //gps 
      //self.$refs.photo.$once('photo:send', (photo)=>{self.break_on = true;})
    },
    breakOffClick(){
      const self = this;
      //gps 
      //self.$refs.photo.$once('photo:send', (photo)=>{self.break_on = false;})
    },
  },
  beforeDestroy() {
    const self = this;
    self.$refs.photo.$off('camera:send');
  },
  mounted() {
    const self = this;
   // API.getTest().then(data => console.log("TCL: mounted -> data", data));    
    API.activeGet().then(data => self.active_data = data);
    API.teamGet().then(data => self.team_data = data);
    API.eventsGet().then(data => self.events_data = data);
  }
};
</script>

