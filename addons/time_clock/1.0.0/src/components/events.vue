<template>
  <f7-list media-list :class="[active? 'active' : '', 'time-clock-list']">
    <f7-list-item
      v-for="(item, index) in data"
      :key="'event_'+index"
      :title="item.name" 
      link 
      no-chevron
    >
      <div
        slot="media"
        class="time-clock-item-image"
        :style="{backgroundImage: 'url('+item.image+')'}"
      ></div>
      <div class="description">{{item.coordinate}}</div>
      <div slot="content-end" class="time">
        {{$moment(new Date(item.date)).format('HH:mm')}}
        <br>
        {{$t('time_clock.index.clock_event_options')[item.event]}}
      </div>
    </f7-list-item>
  </f7-list>
</template>

<script>
export default {
  nane: "Events",
  props: {
    data:{
      type: Array,
      default: []
    },
    active:{
      type: Boolean,
      default: false
    }
  }
};
</script>