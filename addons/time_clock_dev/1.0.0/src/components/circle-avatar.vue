<template>
  <div>
    <div v-for="(days, index) in data"
         :key="'days_'+index"
         :title="index">

      <f7-block-title class="time-clock-divider">{{ days.title }}</f7-block-title>

      <div class="time-clock-circle-avatar" v-if="loaded">
        <div v-for="(attendance, index) in days.attendances" :key="'avatar_'+index" class="container"
             v-show="index <=2 || more_clicked"
             @click="goSearch(item.name)">
          <div class="image" :style="{ backgroundImage: 'url('+attendance.icon_url+')'}"></div>
          <div class="name">{{ attendance.user_name }}</div>
        </div>
        <div class="container" @click="clickMore" v-if="!more_clicked && days.attendances.length > 3">
          <div class="image more"></div>
          <div class="name more">{{ $t(`${addonConfig.package}.index.more_button`) }}</div>
        </div>
        <div class="container" v-if="days.attendances.length === 0">
          <div class="no-activity">{{ $t(`${addonConfig.package}.index.no_activity`) }}</div>
        </div>

        <div class="time-clock-circle-avatar skeleton-text skeleton-effect-blink" v-if="!loaded">
          <div v-for="(index) in 4" :key="'avatar_skeleton_'+index" class="container">
            <div class="image skeleton-element"></div>
            <div class="name">______</div>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>

<script>
import addonConfig from "../addonConfig";

export default {
  name: "CircleAvatar",
  props: {
    data: {
      type: Object,
      default: {}
    },
    loaded: Boolean,
  },
  methods: {
    clickMore() {
      const self = this;
      self.more_clicked = true;
    },
    goSearch(val) {
      const self = this;
      self.$f7router.navigate('/time-clock/search/', {
        props: {
          start_search: val
        }
      })
    }
  },
  data() {
    return {
      addonConfig,
      more_clicked: false,
    }
  }
};
</script>
