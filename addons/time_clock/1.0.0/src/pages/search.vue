<template>
  <f7-page class="time-clock-search-page" :page-content="false" @page:beforein="pageBeforeIn"
           @page:beforeout="pageBeforeOut">
    <f7-navbar>
      <tommy-nav-back force></tommy-nav-back>
      <f7-nav-title>{{$t('time_clock.search.title')}}</f7-nav-title>
    </f7-navbar>
    <f7-page-content ref="pageContent">
      <f7-list class="time-clock-searchbar-list">
        <date-range-select
          v-model="dateRange"
          @change="onDateRangeChange"
          @save="onDateRangeSave">
        </date-range-select>

        <f7-icon slot="media" icon="demo-list-icon"></f7-icon>
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
          ref="searhbar"
        />
      </f7-list>
      <!--
      <f7-block-title class="time-clock-divider">{{$t('time_clock.search.results_divider')}}</f7-block-title>
      -->
      <!--Events -->
      <template v-if="loaded">
        <!--
        <Events
          :data="events_data"
          :devider="$t('time_clock.index.active_title')"
          :loaded="loaded"
          v-if="events_data.length > 0"
        >
        </Events>
        -->


      </template>
      <template v-if="!loaded">
      </template>




      <Events
        :data="formattedAttendanceData"
        :loaded="loaded.attendance"
      />
      <div class="not-found" v-if="attendanceData.length === 0"><p>{{$t('time_clock.search.not_found')}}</p></div>

    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from "../api";
  import Events from "../components/events.vue";
  import dateRangeSelect from 'tommy_core/src/components/date-range-select.vue';

  export default {
    name: "TimeClockSearch",
    props: {
      start_search: {
        type: String,
        default: null,
      }
    },
    components: {
      Events,
      dateRangeSelect
    },
    data() {
      const self = this;
      return {
        dateRange: null,
        delayTimerSearch: null,
        search: null,
        searchEnabled: false,
        scrollTop: 0,

        loaded: {
          first: false,
          active: false,
          attendance: false,
        },

        activeData: [],
        formattedActiveData: {},
        attendanceData: [],
        formattedAttendanceData: {},
      };
    },
    created() {
      const self = this;
    },
    computed: {},
    methods: {
      pageBeforeIn() {
        const self = this;
        self.$refs.pageContent.$el.scrollTop = self.scrollTop;
      },
      pageBeforeOut() {
        const self = this;
        self.scrollTop = self.$refs.pageContent.$el.scrollTop;
      },
      // dateRangeClick() {
      //   const self = this;
      //   self.$f7router.navigate('/time-clock/date-range/', {
      //     props: {
      //       date_range: self.date_range,
      //       date_range_custom: self.date_range_custom,
      //       editRange: self.editRange,
      //     }
      //   })
      // },
      // editRange(date_range, date_range_custom) {
      //   const self = this;
      //   self.date_range = date_range;
      //   if (date_range === 'custom') self.date_range_custom = date_range_custom;
      //   self.getSearchData(self.search);
      // },
      onSearchbarSearch(val) {
        const self = this;
        self.search = val;
        clearTimeout(self.delayTimerSearch);
        self.delayTimerSearch = setTimeout(() => {
          self.getSearchData(val)
        }, 1000);
      },
      getSearchData(searchText) {
        console.log('getSearchData');
        const self = this;

        const otherOptions = {};
        if (self.dateRange) {
          otherOptions.date_range = self.dateRange;
        }
        if (searchText) {
          otherOptions.search = searchText;
        }

        // if (val.length === 0) return;

        self.loaded = false;
        // const searchParams = {};
        // searchParams.range = self.date_range;

        // if (self.date_range === 'custom') {
        //   searchParams.date_range = [
        //     self.date_range_custom.begin,
        //     self.date_range_custom.end
        //   ];
        // } else {
        //   searchParams.date_range = self.date_range;
        // }

        // API.eventsSearch(searchParams).then(data => {
        // let eventsData = [];
        // data.forEach((dataItem, index) => {
        //   let eventData = {};
        //   eventData.timestamp = dataItem.date;
        //   eventData.event = dataItem.event;
        //   eventData.id = dataItem.id;
        //   eventData.icon_url = dataItem.image;
        //   eventData.name = dataItem.name;
        //
        //   eventsData.push(eventData);
        // })
        //   self.events_data = data;
        //   self.loaded = true;
        // });


        console.log('GET SEARCH DATA');

        //copied from index.
        return Promise.all([
          self.$api.getInstalledAddonPermission(
            "time_clock",
            "attendance_other_access",
            {with_filters: true}
          )
        ]).then(v => {
          self.viewOthers = self.checkPermision(v[0]);


          API.getAttendances(null, false, self.viewOthers, otherOptions).then(data => {
            self.events_data = API.prepareAttendances(data, self);
            self.loaded = true;
            // self.updateStatus();
          });
        });


      },
      onSearchbarClear() {
      },

      //copied from index.
      checkPermision(p) {
        const self = this;
        let view = p.filters.find(e => {
          if (e.context === "members") {
            if (e.user_id === API.actorId) return true;
          } else if (e.context === "roles") {
            if (API.actor.roles.indexOf(e.name) > 0) return true;
          }
        });
        return typeof view !== "undefined";
      },

      onDateRangeChange(value) {
        console.log('search - date range change: ' + value);
      },

      onDateRangeSave(value) {
        console.log('search - date range save: ' + value);
        this.dateRange = value;
      },


    },
    beforeDestroy() {
      const self = this;
    },
    mounted() {
      const self = this;
      if (self.start_search) {
        self.search = self.start_search;
        self.$refs.searhbar.enable();
        self.getSearchData(self.start_search);
      }
    }
  };
</script>
