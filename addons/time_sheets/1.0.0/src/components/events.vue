<template>
  <div v-if="data">


    <f7-list media-list class="time-sheet-list" v-if="loaded">
      <f7-list-item
        v-for="(timesheets, index) in data"
        :key="'timesheets_'+index"
        :title="timesheets.title"
        :link="'/time-sheets/detail/' + timesheets.id"
      >
        <div slot="media">
          <hours-minutes-badge :hours="String(timesheets.hours)"
                               :minutes="String(timesheets.minutes)"></hours-minutes-badge>
        </div>
        <div class="description">{{ timesheets.description }}</div>
      </f7-list-item>
    </f7-list>

    <div class="no-attendances" v-if="data.length === 0">{{$t('time_sheets.index.no_attendances')}}</div>

    <f7-list media-list class="time-clock-list" v-if="!loaded">
      <f7-block-title class="time-clock-divider"></f7-block-title>
      <f7-list-item
        v-for="(index) in skeleton"
        :key="'event_'+index"
        title="________ ________"
        class="skeleton-effect-blink skeleton-text"
      >
        <div slot="media" class="time-clock-item-image"></div>
        <div class="description">_________</div>
        <div slot="content-end" class="time">
          _______
          <br/>___________
        </div>
      </f7-list-item>
    </f7-list>
  </div>
</template>

<script>
  import hoursMinutesBadge from '../components/hours-minutes-badge.vue';

  export default {
    name: "Events",
    components: {
      hoursMinutesBadge
    },
    props: {
      data: {
        type: Array,
        default: {}
      },
      skeleton: {
        type: Number,
        default: 4
      },
      loaded: {
        type: Boolean,
        default: false,
      }
    },
    data() {
      const self = this;
      return {};
    },
    mounted() {
      const self = this;
    },
  };
</script>
