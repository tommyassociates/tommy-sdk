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

      <template v-if="isSearch">
        <div class="time-clock-active" v-if="viewOthers && activeData !== null">
          <Events
            :data="formattedActiveData"
            :skeleton="1"
            :loaded="loaded.active"
          />
          <!-- </f7-list>-->
        </div>


        <Events
          :data="formattedAttendanceData"
          :loaded="loaded.attendance"
        />
      </template>
      <div class="not-found" v-if="attendanceData.length === 0"><p>{{$t('time_clock.search.not_found')}}</p></div>

    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from "../api";
  import AttendanceService from "../services/attendance-service";

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
        dateRange: '',
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
      API.actorId = API.getUserId(self);
      API.actor = API.getActor(self);
    },
    computed: {
      isSearch() {
        const self = this;
        return self.dateRange || self.search;
      }
    },
    methods: {
      pageBeforeIn() {
        const self = this;
        self.$refs.pageContent.$el.scrollTop = self.scrollTop;
      },
      pageBeforeOut() {
        const self = this;
        self.scrollTop = self.$refs.pageContent.$el.scrollTop;
      },
      onSearchbarSearch(val) {
        const self = this;
        self.search = val;
        clearTimeout(self.delayTimerSearch);
        self.delayTimerSearch = setTimeout(() => {
          self.getSearchData(val)
        }, 1000);
      },
      getSearchData(searchText) {
        const self = this;
        self.search = searchText;
        this.refreshSearchResults();
      },
      onSearchbarClear() {
        const self = this;
        self.search = '';
      },

      onDateRangeChange(value) {
        const self = this;
        console.log('search - date range change: ' + value);
      },

      onDateRangeSave(value) {
        const self = this;
        console.log('search - date range save: ' + value);

        //self.dateRange = value;

        self.refreshSearchResults();
      },


      refreshSearchResults() {
        const self = this;
        let otherOptions = {
          others: self.viewOthers,
        };
        if (self.dateRange) {
          otherOptions.date_range = self.dateRange;
          console.log('daterange', self.dateRange);
        }
        if (self.search) {
          otherOptions.search = encodeURIComponent(self.search);
        }

        API.getAttendances({otherOptions}).then(data => {
          self.attendanceData = AttendanceService.prepareAttendances(data, self);
          self.formattedAttendanceData = AttendanceService.splitAttendanceIntoDays(self.attendanceData, self);
          self.loaded.attendance = true;
          self.loaded.first = true;
        });
        API.getAttendancesActive({otherOptions}).then(data => {
          self.activeData = AttendanceService.prepareAttendance(data, self);
          self.formattedActiveData = AttendanceService.formatAttendanceActive(self.activeData, self);
          self.loaded.active = true;
        });
      },


    },
    beforeDestroy() {
      const self = this;
    },
    mounted() {
      const self = this;

      return Promise.all([
        self.$api.getInstalledAddonPermission(
          "time_clock",
          "attendance_other_access",
          {with_filters: true}
        )
      ]).then(v => {
        self.viewOthers = API.checkPermision(v[0], self);
        self.refreshSearchResults();
      });


    }
  };
</script>
