<template>
  <f7-page id="vitals_element__history" :class="`vitals-element-history-page vitals-${vitalsElement}-history-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
    </f7-navbar>

    <f7-block>
      <f7-segmented>
        <f7-button :active="range === 'day'" @click="range = 'day'">{{t('date_options.0')}}</f7-button>
        <f7-button :active="range === 'week'" @click="range = 'week'">{{t('date_options.1')}}</f7-button>
        <f7-button :active="range === 'month'" @click="range = 'month'">{{t('date_options.2')}}</f7-button>
      </f7-segmented>
    </f7-block>

    <div :class="`vitals-element-chart-clicked vitals-${vitalsElement}-chart-clicked`">
      <span>{{clickedDate}}</span>
      <span>{{clickedValue}}</span>
    </div>
    <template v-if="data && data.length">
      <div :class="`vitals-element-chart vitals-${vitalsElement}-chart`" v-if="range === 'day'" key="chart-day">
        <div ref="chartDay"></div>
      </div>
      <div :class="`vitals-element-chart vitals-${vitalsElement}-chart`" v-if="range === 'week'" key="chart-week">
        <div ref="chartWeek"></div>
      </div>
      <div :class="`vitals-element-chart vitals-${vitalsElement}-chart`" v-if="range === 'month'" key="chart-month">
        <div ref="chartMonth"></div>
      </div>
    </template>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      addon: String,
      vitalsElement: String,
    },
    data() {
      return {
        data: null,
        clicked: null,
        range: 'day',
        chartColors: ['#5FA81A', '#F5A623', '#FF4500'],
      };
    },
    mounted() {
      const self = this;
      const dateFrom = new Date().setMonth(new Date().getMonth() - 1);
      const dateTo = new Date();
      API.getRecords(self.addon, self.vitalsElement, self.$root.user, { dateFrom, dateTo }).then((data) => {
        self.data = (data || []).sort((a, b) => {
          const aDate = self.itemDate(a);
          const bDate = self.itemDate(b);

          return aDate.getTime() - bDate.getTime();
        });
        self.$nextTick(() => {
          self.initChart();
        });
      });
    },
    watch: {
      range() {
        const self = this;
        self.clicked = null;
        self.$nextTick(() => {
          self.initChart();
        });
      },
    },
    computed: {
      clickedDate() {
        const self = this;
        if (!self.clicked) return '';
        if (self.chartWeekSumsDays && self.range === 'week') {
          return self.$moment(self.clicked.x).format('DD MMM YYYY');
        }
        if (self.chartMonthSumsDays && self.range === 'month') {
          return self.$moment(self.clicked.x).format('DD MMM YYYY');
        }
        return self.$moment(self.clicked.x).format('DD MMM YYYY HH:mm');
      },
      clickedValue() {
        const self = this;
        if (!self.clicked) return '';
        const originalItem = self.data[self.clicked.id];
        const value = originalItem.data.value;
        return `${value[0]}/${value[1]} ${self.t('vital_units.0')} ${value[2]} ${self.t('vital_units.2')}`;
      },
    },
    methods: {
      todayValues(index) {
        const self = this;
        if (!self.data) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return self.data
          .filter((el) => {
            const d = self.itemDate(el);
            if (d.getTime() > today.getTime()) return true;
            return false;
          })
          .map((el) => {
            const elDate = self.itemDate(el);
            return {
              y: parseInt(el.data.value[index], 10),
              x: elDate,
              id: self.data.indexOf(el),
            };
          });
      },
      weekValues(index) {
        const self = this;
        if (!self.data) return null;
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setMonth(weekStart.getMonth(), weekStart.getDate() - 7);

        const values = self.data
          .filter((el) => {
            const d = self.itemDate(el);
            if (d.getTime() > weekStart.getTime()) return true;
            return false;
          });
        return values
          .map((el) => {
            const elDate = self.itemDate(el);
            return {
              y: parseInt(el.data.value[index], 10),
              x: elDate,
              id: self.data.indexOf(el),
            };
          });
      },
      monthValues(index) {
        const self = this;
        if (!self.data) return null;
        const monthStart = new Date();
        monthStart.setHours(0, 0, 0, 0);
        monthStart.setMonth(monthStart.getMonth() - 1, monthStart.getDate());
        const values = self.data
          .filter((el) => {
            const d = self.itemDate(el);
            if (d.getTime() > monthStart.getTime()) return true;
            return false;
          });
        return values.map((el) => {
          const elDate = self.itemDate(el);
          return {
            y: parseInt(el.data.value[index], 10),
            x: elDate,
            id: self.data.indexOf(el),
          };
        });
      },
      itemDate(item) {
        const d = new Date(item.data.date);
        const hours = parseInt(item.data.time.split(':')[0], 10);
        const mins = parseInt(item.data.time.split(':')[1], 10);
        d.setHours(hours, mins);
        return d;
      },
      t(v, d) {
        return this.$t(`${this.addon}.history.${v}`, d);
      },
      initChart() {
        const self = this;
        const range = self.range;
        if (!self.data || !self.data.length) return;
        const chartType = 'line';

        const common = {
          chart: {
            type: chartType,
          },
          credits: {
            enabled: false,
          },
          legend: {
            enabled: false,
          },
          title: null,
          tooltip: {
            enabled: false,
          },
          xAxis: {
            type: 'datetime',
          },
          yAxis: {
            title: null,
          },
          time: {
            timezoneOffset: new Date().getTimezoneOffset(),
          },
          plotOptions: {
            line: {
              marker: {
                enabled: true,
              },
            },
          },
        };
        const seriesCommon = {
          cursor: 'pointer',
          marker: {
            symbol: 'circle',
          },
          point: {
            events: {
              click() {
                self.clicked = this;
              },
              select() {
                self.clicked = this;
              },
            },
          },
        };
        if (range === 'day') {
          self.$highcharts.chart(self.$refs.chartDay, {
            ...common,
            series: [
              {
                ...seriesCommon,
                color: self.chartColors[0],
                data: self.todayValues(0),
              },
              {
                ...seriesCommon,
                color: self.chartColors[1],
                data: self.todayValues(1),
              },
              {
                ...seriesCommon,
                color: self.chartColors[2],
                data: self.todayValues(2),
              },
            ],
          });
        }
        if (range === 'week') {
          self.$highcharts.chart(self.$refs.chartWeek, {
            ...common,
            series: [
              {
                ...seriesCommon,
                color: self.chartColors[0],
                data: self.weekValues(0),
              },
              {
                ...seriesCommon,
                color: self.chartColors[1],
                data: self.weekValues(1),
              },
              {
                ...seriesCommon,
                color: self.chartColors[2],
                data: self.weekValues(2),
              },
            ],
          });
        }
        if (range === 'month') {
          self.$highcharts.chart(self.$refs.chartMonth, {
            ...common,
            series: [
              {
                ...seriesCommon,
                color: self.chartColors[0],
                data: self.monthValues(0),
              },
              {
                ...seriesCommon,
                color: self.chartColors[1],
                data: self.monthValues(1),
              },
              {
                ...seriesCommon,
                color: self.chartColors[2],
                data: self.monthValues(2),
              },
            ],
          });
        }
      },
    },
  };
</script>

