<template>
  <f7-page class="time-clock-map-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_clock.event_details.where_label')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-only @click="editGeo" v-if="edit || justAdd">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-list media-list inline-labels>
        <f7-list-input
            label="Latitude"
            type="number"
            :readonly="!edit"
            :value="new_latitude"
            step = "0.000001"
            @input="new_latitude = $event.target.value"
        />
        <f7-list-input
            label="Latitude"
            type="number"
            :readonly="!edit"
            :value="new_longitude"
            step = "0.000001"
            @input="new_longitude = $event.target.value"
        />
    </f7-list>
    <div class="map-conainer">
        
    </div>
  </f7-page>
</template>

<script>
export default {
  name: "Map",
  props: {
    edit: Boolean,
    latitude: String,
    longitude: String,
    callback: Function,
    justAdd: {
      type: Boolean,
      default: false
    }
  },
  methods: {
    editGeo() {
      const self = this;
    },
    updateGeoMap() {
      const self = this;
    }
  },
  data() {
    const self = this;
    return {
      new_latitude: Number(self.latitude),
      new_longitude: Number(self.longitude)
    };
  }
};
</script>