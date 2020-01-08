<template>
  <div>
    <f7-list media-list class="time-clock-list" v-if="loaded">
      <f7-block-title class="time-clock-divider">{{devider}}</f7-block-title>
      <f7-list-item
        v-for="(item, index) in data"
        :key="'event_'+index"
        :title="item.user_name"
        :link="'/time-clock/detail/' + item.id"
        no-chevron
      >
        <div
          slot="media"
          class="time-clock-item-image"
          :style="{backgroundImage: 'url('+item.icon_url+')'}"
        ></div>
        <div class="description">{{item.address}}</div>
        <div slot="content-end" class="time">
          {{$moment(new Date(item.timestamp)).format('HH:mm')}}
          <br />
          {{$t('time_clock.index.clock_event_options.'+item.status)}}
        </div>
      </f7-list-item>
      <div class="no-attendances" v-if="data.length === 0">{{$t('time_clock.index.no_attendances')}}</div>
    </f7-list>
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
          <br />___________
        </div>
      </f7-list-item>
    </f7-list>
  </div>
</template>

<script>
export default {
  nane: "Events",
  props: {
    data: {
      type: Array,
      default: []
    },
    devider: {
      type: String,
    },
    skeleton:{
      type: Number,
      default: 4
    },
    loaded:{
      type: Boolean,
      default: false,
    }
  },
  methods: {}
};
</script>