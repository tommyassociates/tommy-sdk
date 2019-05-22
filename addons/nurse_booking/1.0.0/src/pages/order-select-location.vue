<template>
  <f7-page name="nurse_booking__location" id="nurse_booking__location">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t(`nurse_booking.location.title`)}}</f7-nav-title>
    </f7-navbar>

    <div v-if="locations && locations.length" class="location-card" v-for="(location, index) in locations" :key="index">
      <i class="location-card-icon"></i>
      <div class="location-card-title">
        <span v-if="location.default" class="location-card-default-badge">[{{$t('nurse_booking.location.default_label')}}]</span>
        {{location.city}} {{location.address}}
      </div>
      <a href="#" class="location-delete-button" @click="deleteLocation(location, index)"></a>
      <a href="#" class="location-card-button location-select-button" @click="selectLocation(location, index)" >{{$t('nurse_booking.location.select_button')}}</a>
    </div>

    <div class="location-card location-add-form" v-if="addMode || locations && !locations.length">
      <input type="text" :value="city" :domProps="{defaultValue: defaultCity}" @input="city = $event.target.value" :placeholder="$t('nurse_booking.location.city_placeholder')" />
      <textarea type="text" :value="address || defaultAddress" @input="address = $event.target.value" :placeholder="$t('nurse_booking.location.address_placeholder')"></textarea>
      <label>
        <input type="checkbox" name="default" :checked="isDefault" @change="isDefault = $event.target.checked">
        <i class="framework7-icons">check</i>
        <span>{{$t('nurse_booking.location.set_default_label')}}</span>
      </label>
      <a href="#" class="location-card-button location-save-button" @click="saveLocation()">{{$t('nurse_booking.location.save_button')}}</a>
    </div>

    <a v-if="locations && locations.length" href="#" class="location-add-button" @click="addLocation()">{{$t('nurse_booking.location.add_button')}}</a>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        service: API.cache.booking.services[0],
        locations: null,
        addMode: false,
        city: this.$root.user.location || this.$root.user.city || '',
        address: this.$root.user.address || '',
        isDefault: false,
      };
    },
    mounted() {
      const self = this;
      API.getLocations().then(() => {
        self.locations = [...(API.cache.locations || [])];
      });
    },
    methods: {
      deleteLocation(location, index) {
        const self = this;
        API.removeLocation(index).then(() => {
          self.locations.splice(index, 1);
        });
      },
      selectLocation(location) {
        const self = this;
        const city = location.city;
        const address = location.address;
        const available = city.indexOf('山缘') >= 0 || address.indexOf('山缘') >= 0;
        // const service = self.service;
        // let available;
        // const availableIn = service.data ? service.data.available_in || service.data.availabile_in || [] : [];

        // if (!availableIn || !availableIn.length) {
        //   available = true;
        // } else {
        //   availableIn.forEach((availableCity) => {
        //     const parts = city.toLowerCase()
        //       .split(/[,， ]/)
        //       .map(c => c.replace(/,/g, '').trim())
        //       .filter(f => f.trim());
        //     parts.forEach((p) => {
        //       if (availableCity.toLowerCase().trim() === p) available = true;
        //     });
        //   });
        // }

        if (!available) {
          self.$f7.dialog.alert(self.$t('nurse_booking.location.not_available'));
          return;
        }

        API.cache.booking.location = location;

        if (self.$f7route.query.back) {
          self.$f7router.back();
        } else {
          self.$f7router.navigate('/nurse_booking/order-select-date/');
        }
      },
      saveLocation() {
        const self = this;
        const { city, address, isDefault } = self;
        if (!city || !address) return;

        API.addLocation({ city, address, default: isDefault }).then(() => {
          self.locations = [...(API.cache.locations || [])];
          self.addMode = false;
          self.city = '';
          self.address = '';
          self.isDefault = false;
        });
      },
      addLocation() {
        const self = this;
        self.addMode = true;
      },
    },
  };
</script>

