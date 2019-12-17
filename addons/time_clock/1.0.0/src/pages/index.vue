<template>
  <f7-page class="time-clock-main-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('time_clock.index.title')}}</f7-nav-title>
      <f7-nav-right class="time-clock-navbar-links">
        <f7-link href="/time-clock/settings/" icon-only>
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
  </f7-page>
</template>
<script>
import API from "../api";

export default {
  data() {
    const self = this;
    return {};
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
  }
};
</script>

