<template>
  <f7-page class="time-clock-main-page">
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
  </f7-page>
</template>
<script>
import API from "../api";
import ActiveAvatar from "../components/circle-avatar.vue";
import Events from "../components/events.vue";

export default {
  name: 'TimeClock',
  components:{
    ActiveAvatar,
    Events,
  },
  data() {
    const self = this;
    return {
      clock_on: false,
      start_break: false,
      active_data: [],
      events_data: [],
      team_data: [],
    };
  },
  created() {
    const self = this;
  },
  computed: {},
  methods: {},
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

