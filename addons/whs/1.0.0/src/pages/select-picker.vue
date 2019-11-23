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
      :styleImage="tagStyle"
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
import ListStyles from "../mixins/list-styles.vue";
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
  mixins: [ListStyles],
  mounted() {
    self = this;
    self.getData(this);
  },
  methods: {
    createSearchbar() {
      self = this;
      self.$nextTick(() => {
        const searchbar = self.$f7.searchbar.create({
          el: ".searchbar",
          searchContainer: "#whs-select-" + self.type,
          searchIn: ".item-title"
        });
      });
    },
    selectChanget(e) {
      self = this;
      self.onChange(e.target, e.checked);
    }
  },
  data() {
    return {
      targets: {},
      loaded: false,
      settings: API.main_page.$data.settings
    };
  }
};
</script>
