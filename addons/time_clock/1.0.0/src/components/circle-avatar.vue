<template>
<div>
  <f7-block-title class="time-clock-divider">{{devider}}</f7-block-title>
  <div class="time-clock-circle-avatar" v-if="loaded">
    <div v-for="(item, index) in data" :key="'avatar_'+index" class="container" v-show="index <=2 || more_clicked" @click="goSearch(item.name)">
      <div class="image" :style="{ backgroundImage: 'url('+item.icon_url+')'}"></div>
      <div class="name">{{item.user_name}}</div>
    </div>
    <div class="container" @click="clickMore" v-if="!more_clicked && data.length > 3">
      <div class="image more"></div>
      <div class="name more">{{$t('time_clock.index.more_button')}}</div>
    </div>
  </div>
  <div class="time-clock-circle-avatar skeleton-text skeleton-effect-blink" v-if="!loaded">
    <div v-for="(index) in 4" :key="'avatar_skeleton_'+index" class="container">
      <div class="image skeleton-element" ></div>
      <div class="name">______</div>
    </div>
  </div>
</div>
</template>

<script>
export default {
  name: "CircleAvatar",
  props: {
    data: {
      type: Array,
      default: () => []
    },
    devider: String,
    loaded: Boolean,
  },
  methods:{
    clickMore(){
      const self = this;
      self.more_clicked = true;
    },
    goSearch(val){
      const self = this;
      self.$f7router.navigate('/time-clock/search/',{
        props:{
          start_search: val
        }
      })
    }
  },
  data(){
    return{
      more_clicked: false,
    }
  }
};
</script>