<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.common.select_tags_title')}}</f7-nav-title>
      <f7-subnavbar :inner="false">
        <f7-searchbar :init="false"></f7-searchbar>
      </f7-subnavbar>
    </f7-navbar>
    <select-list type="tag" :data="tags" :styleImage="tagStyle" :loaded="loaded" @change="selectChanget" :selected="selected"/>
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
    multiply: Boolean
  },
  components: {
    "select-list": SelectList
  },
  mixins: [ListStyles],
  mounted() {
    self = this;
    API.getTags().then(data => {
      self.tags = data;
      self.loaded = true;
      self.createSearchbar();
    });
  },
  methods: {
    createSearchbar() {
      self = this;
      self.$nextTick(() => {
        const searchbar = self.$f7.searchbar.create({
          el: ".searchbar",
          searchContainer: "#whs-select-tag",
          searchIn: ".item-title",
          on: {
            search(sb, query, previousQuery) {
              console.log(query, previousQuery);
            }
          }
        });
      });
    },
    selectChanget(e){
      self = this;
      self.onChange(e.target, e.checked);      
    },
    /*
    contextIconSrc(tag) {
      const self = this;
      const $addonAssetsUrl = self.$addonAssetsUrl;
      return `${$addonAssetsUrl}icons/${tag.context.slice(0, -1)}.png`;
    },
    contextIconSrcset(tag) {
      const self = this;
      const $addonAssetsUrl = self.$addonAssetsUrl;
      return `${$addonAssetsUrl}icons/${tag.context.slice(
        0,
        -1
      )}@2x.png 2x,${$addonAssetsUrl}icons/${tag.context.slice(
        0,
        -1
      )}@3x.png 3x`;
    },
    toggleTag(tag, selected) {
      const self = this;
      if (self.onChange) {
        self.onChange(tag, selected);
      }
    }*/
  },
  data() {
    return {
      tags: [],
      loaded: false,
      settings: API.main_page.$data.settings
    };
  }
};
</script>
