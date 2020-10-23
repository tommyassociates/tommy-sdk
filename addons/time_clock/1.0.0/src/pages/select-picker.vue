<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-only @click="saveSelected()" v-if="changet">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
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
import SelectList from "../components/select-list.vue";

export default {
  props: {
    selected: Number,
    saveChange: Function,
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
    this.getData(this);
  },
  methods: {
    createSearchbar() {
      this.$nextTick(() => {
        const searchbar = this.$f7.searchbar.create({
          el: ".searchbar",
          searchContainer: "#time-clock__select-" + this.type,
          searchIn: ".item-title"
        });
      });
    },
    selectChanget(e) {
      this.changet = true;
      this.changet_data = e;
      //this.onChange(e.target, e.checked);
    },
    saveSelected(){
      this.saveChange(this.changet_data.target);
      this.$f7router.back();
    }
  },
  data() {
    return {
      changet: false,
      changet_data: null,
      targets: {},
      loaded: false,
    };
  }
};
</script>
