<template></template>
<script>
import addonConfig from "../addonConfig";
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
      if (this.dialog)
        this.dialogProgress = this.$f7.dialog.progress(
          this.$t(`${addonConfig.package}.index.geo_loading`)
        );
      navigator.geolocation.getCurrentPosition(this.onSuccess, this.onError, {
        maximumAge: 600000,
        timeout: 30000,
        enableHighAccuracy: true
      });
    },
    takeGeoAsync() {
      if (this.dialog)
        this.dialogProgress = this.$f7.dialog.progress(
          this.$t(`${addonConfig.package}.index.geo_loading`)
        );

      return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition((data)=>{this.onSuccess(data, resolve, reject)}, this.onError, {
            maximumAge: 600000,
            timeout: 5000,
            enableHighAccuracy: true
          });
      });

    },
    onSuccess(position, resolve, reject) {
      if (this.dialog) this.dialogProgress.close();
      if (this.getStret) {
        position.coords.name = "";
        this.getStreetName(position.coords, resolve, reject);
      } else {
        this.$emit("geo:taken", position.coords);
        if (typeof resolve === 'function') resolve(position.coords);
      }
    },
    onError(error, resolve, reject) {
      if (this.dialog) this.dialogProgress.close();
      this.$emit("geo:error", error);
      this.$app.notify(error.message);
      console.debug("Take geocordinates error: " + error.message);
      if (typeof reject === 'function') reject(error.message);
    },
    getStreetName(coords, resolve, reject) {
      this.$f7.request({
        url: "https://nominatim.openstreetmap.org/reverse",
        dataType: "json",
        cache: false,
        data: {
          lat: coords.latitude,
          lon: coords.longitude,
          format: "json",
          "accept-language": this.$tommy.config.locale
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
          this.$emit("geo:taken", coords);
          if (typeof resolve === 'function') resolve(coords);
        },
        error: error => {
          coords.name = "";
          this.$emit("geo:error", error);
          if (typeof reject === 'function') reject(error);
        }
      });
    }
  },
  data() {
    return {
      addonConfig,
      isCordova: this.$f7.device.cordova
    };
  }
};
</script>
