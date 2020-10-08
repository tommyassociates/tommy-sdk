<template>
  <f7-page class="time-clock-main-page" :page-content="false">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{ $t(`${addonConfig.package}.locked.confirmation.title`) }}</f7-nav-title>
    </f7-navbar>

    <f7-page-content>
      <div class="text-align-center" style="padding:0px;">
        <div style="position:absolute; top: 50%; transform: translateY(-50%); width: 100%; align-items: center;">
          <checkmark-animation></checkmark-animation>
        </div>
      </div>
    </f7-page-content>
  </f7-page>
</template>
<script>
import addonConfig from "../addonConfig";
import checkmarkAnimation from 'tommy-core/src/components/animations/checkmark-animation.vue';

export default {
  name: "TimeClockLockedConfirmation",
  data() {
    return {
      addonConfig,
    };
  },
  components: {
    checkmarkAnimation
  },

  mounted() {
    const timeoutLength = 6000;
    setTimeout(() => {
      const redirect = '/locked/enter-pin/';
      this.$f7router.navigate(redirect);
    }, timeoutLength);

  },

};
</script>

<style lang="scss">

</style>



