<template></template>
<script>
export default {
  name: "Geo",
  props: {
    dialog: {
      type: Boolean,
      default: true
    }
  },
  methods: {
    takeGeo() {
      const self = this;

      if(self.dialog) self.dialogProgress = self.$f7.dialog.progress(
        self.$t("time_clock.index.geo_loading")
      );
      navigator.geolocation.getCurrentPosition(self.onSuccess, self.onError, {
        maximumAge: 600000,
        timeout: 5000,
        enableHighAccuracy: true
      });
    },
    onSuccess(position) {
      const self = this;
      if(self.dialog) self.dialogProgress.close();
      self.$emit("geo:taken", position.coords);
    },
    onError(error) {
      const self = this;
      if(self.dialog) self.dialogProgress.close();
      self.$emit("geo:error", error);
      self.$app.notify(error.message);
      console.debug("Take geocordinates error: " + error.message);
    }
  },
  data() {
    const self = this;
    return {
      isCordova: self.$f7.device.cordova
    };
  }
};
</script>