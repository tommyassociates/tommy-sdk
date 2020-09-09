<template></template>
<script>
import addonConfig from "../config";
export default {
  name: "Geo",
  props: {
    dialog: {
      type: Boolean,
      default: true
    },
    getStret: {
      type: Boolean,
      default: true
    }
  },
  methods: {
    takeGeo() {
      const self = this;

      if (self.dialog)
        self.dialogProgress = self.$f7.dialog.progress(
          self.$t(`${addonConfig.package}.index.geo_loading`)
        );
      navigator.geolocation.getCurrentPosition(self.onSuccess, self.onError, {
        maximumAge: 600000,
        timeout: 30000,
        enableHighAccuracy: true
      });
    },
    takeGeoAsync() {
      const self = this;

      if (self.dialog)
        self.dialogProgress = self.$f7.dialog.progress(
          self.$t(`${addonConfig.package}.index.geo_loading`)
        );

      return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition((data)=>{self.onSuccess(data, resolve, reject)}, self.onError, {
            maximumAge: 600000,
            timeout: 5000,
            enableHighAccuracy: true
          });
      });

    },
    onSuccess(position, resolve, reject) {
      const self = this;
      if (self.dialog) self.dialogProgress.close();
      if (self.getStret) {
        position.coords.name = "";
        self.getStreetName(position.coords, resolve, reject);
      } else {
        self.$emit("geo:taken", position.coords);
        if (typeof resolve === 'function') resolve(position.coords);
      }
    },
    onError(error, resolve, reject) {
      const self = this;
      if (self.dialog) self.dialogProgress.close();
      self.$emit("geo:error", error);
      self.$app.notify(error.message);
      console.debug("Take geocordinates error: " + error.message);
      if (typeof reject === 'function') reject(error.message);
    },
    getStreetName(coords, resolve, reject) {
      const self = this;
      self.$f7.request({
        url: "https://nominatim.openstreetmap.org/reverse",
        dataType: "json",
        cache: false,
        data: {
          lat: coords.latitude,
          lon: coords.longitude,
          format: "json",
          "accept-language": self.$tommy.config.locale
        },
        success: result => {
          let name = [];
          if (result.address.city) name.push(result.address.city);
          if (result.address.village) name.push(result.address.village);
          if (result.address.road) name.push(result.address.road);
          if (result.address.house_number)
            name.push(result.address.house_number);
          if (name.length > 0) {
            name = name.join(", ");
          } else {
            name = "";
          }
          coords.name = name;
          self.$emit("geo:taken", coords);
          if (typeof resolve === 'function') resolve(coords);
        },
        error: error => {
          coords.name = "";
          self.$emit("geo:error", error);
          if (typeof reject === 'function') reject(error);
        }
      });
    }
  },
  data() {
    const self = this;
    return {
      addonConfig,
      isCordova: self.$f7.device.cordova
    };
  }
};
</script>
