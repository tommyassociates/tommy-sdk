<template>
  <f7-page class="time-clock-search-page" :page-content="false" @page:beforein="pageBeforeIn" @page:beforeout="pageBeforeOut">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_clock.search.title')}}</f7-nav-title>
    </f7-navbar>
    <f7-page-content ref="pageContent"> 
      <f7-list class="time-clock-searchbar-list">
        <f7-list-item
          :title="$t('time_clock.date_range.title')"
          :after="$t('time_clock.date_range.'+date_range+'_label')"
          link
          @click="dateRangeClick" 
        />
        <f7-searchbar
          class="time-clock-searchbar"
          :placeholder="$t('time_clock.search.search_placeholder')"
          customSearch
          :backdrop="false"
          disableButton
          :disable-button-text="$t('time_clock.search.search_disable_button')"
          :value="search"
          @input="onSearchbarSearch($event.target.value)"
          @searchbar:clear="onSearchbarClear"
          @searchbar:enable="searchEnabled = true"
          @searchbar:disable="searchEnabled = false"
        />
      </f7-list>
      <f7-block-title class="time-clock-divider">Result</f7-block-title>
      <!--Events -->
      <Events :data="events_data" v-if="loaded"/>
    </f7-page-content>
  </f7-page>
</template>
<script>
import API from "../api";
import Events from "../components/events.vue";

export default {
  name: "TimeClockSearch",
  components: {
    Events
  },
  data() {
    const self = this;
    return {
      date_range: "notset",
      date_range_custom:{
        begin: null,
        end: null,
      },
      loaded: false,
      delayTimerSearch: null,
      search: null,
      searchEnabled: false,
      events_data: [],
      scrollTop: 0,
    };
  },
  created() {
    const self = this;
  },
  computed: {},
  methods: {
    pageBeforeIn(){
      const self = this;
      self.$refs.pageContent.$el.scrollTop = self.scrollTop;
    },
    pageBeforeOut(){
      const self = this;
      self.scrollTop = self.$refs.pageContent.$el.scrollTop;
    },
    dateRangeClick(){
      const self = this;
      self.$f7router.navigate('/time-clock/date-range/',{
        props: {
          date_range: self.date_range,
          date_range_custom: self.date_range_custom,
          editRange: self.editRange,
        }
      })
    },
    editRange(date_range, date_range_custom){
      const self = this;
      self.date_range = date_range;
      if (date_range === 'custom') self.date_range_custom = date_range_custom;
      self.getSearchData(self.search);
    },
    onSearchbarSearch(val) {
      const self = this;
      self.search = val;
      clearTimeout(self.delayTimerSearch);
      self.delayTimerSearch = setTimeout(() => {self.getSearchData(val)}, 1000);
    },
    getSearchData(val){
      const self = this;
        if (val.length === 0) return;
        self.loaded = false;
        const searchParams = {
          text: val,
        }
        searchParams.range = self.date_range;
        if (self.date_range === "custom") {
          searchParams.custom_range_begin = self.date_range_custom.begin;
          searchParams.custom_range_end = self.date_range_custom.end;
          }

        API.eventsSearch(searchParams).then(data => {
          self.events_data = data;
          self.loaded = true;
        });
    },
    onSearchbarClear() {}
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  }
};
</script>