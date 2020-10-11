<template>
  <f7-page :page-content="false">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{ $t(`${addonConfig.package}.settings.title`) }}</f7-nav-title>
    </f7-navbar>
    <f7-page-content>
      <lock-addon :package="String(addonConfig.package)"></lock-addon>
    </f7-page-content>
  </f7-page>
</template>

<script>
import addonConfig from "../addonConfig";
import lockAddon from 'tommy-core/src/components/lock-addon.vue';

export default {
  name: "settings",
  components: {
    lockAddon,
  },
  data() {
    return {
      addonConfig,
    };
  },
}
</script>

<style scoped>

</style>

