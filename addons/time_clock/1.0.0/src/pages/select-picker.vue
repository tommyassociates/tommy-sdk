<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-subnavbar :inner="false">
        <f7-searchbar :init="false"></f7-searchbar>
      </f7-subnavbar>
    </f7-navbar>
    <select-list
      :type="type"
      :data="targets"
      :loaded="loaded"
      @change="selectChanget"
      :selected="selected"
      :multiply="multiply"
      :image_link="image_link"
    />
  </f7-page>
</template>
<script>
import API from "../api";
import SelectList from "../components/select-list.vue";

export default {
  props: {
    selected: Array,
    onChange: Function,
    getData: Function,
    pageTitle: String,
    type: String,
    multiply: Boolean,
    image_link: String
  },
  components: {
    "select-list": SelectList
  },
  mounted() {
    const self = this;
    self.getData(this);
  },
  methods: {
    createSearchbar() {
      const self = this;
      self.$nextTick(() => {
        const searchbar = self.$f7.searchbar.create({
          el: ".searchbar",
          searchContainer: "#time-clock-select-" + self.type,
          searchIn: ".item-title"
        });
      });
    },
    selectChanget(e) {
      const self = this;
      self.onChange(e.target, e.checked);
    }
  },
  data() {
    return {
      targets: {},
      loaded: false,
    };
  }
};
</script>
