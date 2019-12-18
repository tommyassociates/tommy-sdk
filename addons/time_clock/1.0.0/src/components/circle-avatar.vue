<template>
  <div class="time-clock-circle-avatar">
    <div v-for="(item, index) in data" :key="'avatar_'+index" class="container">
      <div class="image" :style="{ backgroundImage: 'url('+item.image+')'}"></div>
      <div class="name">{{item.name}}</div>
    </div>
    <div class="container">
      <div class="image more"></div>
      <div class="name more">{{$t('time_clock.index.more_button')}}</div>
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
    }
  }
};
</script>