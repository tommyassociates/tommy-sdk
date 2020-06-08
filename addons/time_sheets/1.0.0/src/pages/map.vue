<template>
  <f7-page class="time-clock-map-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_sheets.event_details.where_label')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-only @click="editGeo" v-if="edit && edited">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <div id="time-clock-map-conainer"></div>
  </f7-page>
</template>

<script>
import L from "leaflet";

export default {
  name: "MapPage",
  props: {
    edit: Boolean,
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    address: String,
    callback: Function
  },
  methods: {
    editGeo() {
      const self = this;
      self.$f7router.back();
      self.callback(self.new_latitude, self.new_longitude, self.new_accuracy, self.new_address);
    },
    onMapClick(e) {
      console.log("TCL: onMapClick -> e", e);
      const self = this;
      self.edited = true;
      if (self.circle) self.circle.remove();
      if (self.marker) self.marker.remove();

      self.marker = L.marker(e.latlng, {
        icon: self.customIcon
      }).addTo(self.map);

      self.new_latitude = e.latlng.lat;
      self.new_longitude = e.latlng.lng;
      self.new_accuracy = 0;

      self.getStreetName(e.latlng).then(name => {
        self.marker.bindPopup(name).openPopup();
        self.new_address = name;

      });

    },
    getStreetName(coords) {
      const self = this;
      return new Promise((resolve, reject) => {
        self.$f7.request({
          url: "https://nominatim.openstreetmap.org/reverse",
          dataType: "json",
          cache: false,
          data: {
            lat: coords.lat,
            lon: coords.lng,
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
            resolve(name);
          },
          error: error => {
            reject(error);
          }
        });
      });
    }
  },
  mounted() {
    const self = this;
    self.map = L.map("time-clock-map-conainer").setView(
      [self.new_latitude, self.new_longitude],
      16
    );

    if (self.edit) {
      self.map.on("click", self.onMapClick);
    }

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(self.map);

    if (self.new_accuracy) {
      self.circle = L.circle([self.new_latitude, self.new_longitude], {
        fillColor: "#136AEC",
        opacity: 0.13,
        radius: self.new_accuracy / 2,
        interactive: false
      }).addTo(self.map);
    }

    self.customIcon = L.icon({
      iconUrl:
        "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMC45NDkiIGhlaWdodD0iMjguNjAyIiB2aWV3Qm94PSIwIDAgMjAuOTQ5IDI4LjYwMiI+PHBhdGggZD0iTTEwLjQ3NCwyOC42YS40NTkuNDU5LDAsMCwxLS4zMjktLjEzNiw1OC44MjksNTguODI5LDAsMCwxLTUuMDU0LTYuMTQyLDM3LjI4NywzNy4yODcsMCwwLDEtMy40ODUtNS44NkExNS4xLDE1LjEsMCwwLDEsMCwxMC4yOCwxMC4zOSwxMC4zOSwwLDAsMSwxMC40NzQsMCwxMC4zOTIsMTAuMzkyLDAsMCwxLDIwLjk0OSwxMC4yOGExNS4xMSwxNS4xMSwwLDAsMS0xLjYwNyw2LjE4MywzNy4yMjgsMzcuMjI4LDAsMCwxLTMuNDg2LDUuODZBNTguNDMxLDU4LjQzMSwwLDAsMSwxMC44LDI4LjQ2NS40NjEuNDYxLDAsMCwxLDEwLjQ3NCwyOC42Wk0xMC41LDUuNDc3YTQuNTY0LDQuNTY0LDAsMSwwLDQuNTY0LDQuNTY0QTQuNTY5LDQuNTY5LDAsMCwwLDEwLjUsNS40NzdaIiBmaWxsPSIjZmY0NTAwIi8+PC9zdmc+",
      iconSize: [21, 29],
      iconAnchor: [10, 29],
      popupAnchor: [0, -33]
    });

    if (self.new_address) {
      self.marker = L.marker([self.new_latitude, self.new_longitude], {
        icon: self.customIcon
      })
        .addTo(self.map)
        .bindPopup(self.new_address)
        .openPopup();
    } else {
      self.marker = L.marker([self.new_latitude, self.new_longitude], {
        icon: self.customIcon
      }).addTo(self.map);
    }
  },
  beforeDestroy() {
    const self = this;
    self.map.off();
    self.map.remove();
  },
  data() {
    const self = this;
    return {
      edited: false,
      new_latitude: self.latitude,
      new_longitude: self.longitude,
      new_address: self.address,
      new_accuracy: self.accuracy
    };
  }
};
</script>
