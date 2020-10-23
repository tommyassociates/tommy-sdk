<template>
  <div v-if="data">
    <div v-for="(days, index) in data"
         :key="'days_'+index"
         :title="index">

      <f7-block-title class="time-clock__divider">{{ days.title }}</f7-block-title>

      <f7-list media-list class="time-clock__list" v-if="loaded">
        <f7-list-item
          v-for="(attendance, index) in days.attendances"
          :key="'event_data_'+index"
          :title="attendance.user_name"
          :link="`${addonConfig.baseUrl}detail/${attendance.id}`"
          no-chevron
        >
          <div
            slot="media"
            class="time-clock__item-image"
            :style="{backgroundImage: 'url('+attendance.icon_url+')'}"
          ></div>
          <div class="description">{{ attendance.address }}</div>
          <div slot="content-end" class="time">
            {{ $moment(new Date(attendance.timestamp)).format('HH:mm') }}
            <br/>
            {{ $t(`${addonConfig.package}.index.clock_event_options.${attendance.status}`) }}
          </div>
        </f7-list-item>
      </f7-list>

    </div>
    <div class="no-attendances" v-if="data.length === 0">{{ $t(`${addonConfig.package}.index.no_attendances`) }}</div>

    <f7-list media-list class="time-clock__list" v-if="!loaded">
      <f7-block-title class="time-clock__divider"></f7-block-title>
      <f7-list-item
        v-for="(index) in skeleton"
        :key="'event_'+index"
        title="________ ________"
        class="skeleton-effect-blink skeleton-text"
      >
        <div slot="media" class="time-clock__item-image"></div>
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
import addonConfig from "../addonConfig";

export default {
  nane: "Events",
  props: {
    data: {
      type: Object,
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
    return {
      addonConfig,
    };
  },
};
</script>
