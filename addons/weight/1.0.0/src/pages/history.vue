<template>
  <f7-page id="weight__history" class="weight-history-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('weight.history.title')}}</f7-nav-title>
    </f7-navbar>

    <f7-block>
      <f7-segmented>
        <f7-button :active="range === 'day'" @click="range = 'day'">{{$t('weight.history.date_options.0')}}</f7-button>
        <f7-button :active="range === 'week'" @click="range = 'week'">{{$t('weight.history.date_options.1')}}</f7-button>
        <f7-button :active="range === 'month'" @click="range = 'month'">{{$t('weight.history.date_options.2')}}</f7-button>
      </f7-segmented>
    </f7-block>

    <div class="weight-chart-clicked">
      <span>{{clickedDate}}</span>
      <span>{{clickedValue}}</span>
    </div>
    <template v-if="data && data.length">
      <div class="weight-chart" v-if="range === 'day'" key="weight-chart-day">
        <div ref="weightChartDay"></div>
      </div>
      <div class="weight-chart" v-if="range === 'week'" key="weight-chart-week">
        <div ref="weightChartWeek"></div>
      </div>
      <div class="weight-chart" v-if="range === 'month'" key="weight-chart-month">
        <div ref="weightChartMonth"></div>
      </div>
    </template>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        data: null,
        clicked: null,
        range: 'day',
      };
    },
    mounted() {
      const self = this;
      const dateFrom = new Date().setMonth(new Date().getMonth() - 1);
      const dateTo = new Date();
      API.getRecords(self.$root.user, { dateFrom, dateTo }).then((data) => {
        self.data = (data || []).sort((a, b) => {
          const aDate = new Date(a.data.date);
          const [aH, aM] = a.data.time.split(':');
          aDate.setHours(parseInt(aH, 10), parseInt(aM, 10));

          const bDate = new Date(b.data.date);
          const [bH, bM] = b.data.time.split(':');
          bDate.setHours(parseInt(bH, 10), parseInt(bM, 10));

          return bDate - aDate;
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
        return self.$moment(self.clicked.x).format('DD MMM YYYY HH:mm');
      },
      clickedValue() {
        const self = this;
        if (!self.clicked) return '';
        const originalItem = self.data[self.clicked.id];
        return `${self.clicked.y} ${self.$t(`weight.history.vital_unit.${originalItem.data.unit}`)}`;
      },

      todayValues() {
        const self = this;
        if (!self.data) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return self.data.filter((el) => {
          const hours = parseInt(el.data.time.split(':')[0], 10);
          const mins = parseInt(el.data.time.split(':')[1], 10);
          const d = new Date(el.data.date);
          d.setHours(hours, mins);
          if (d.getTime() > today.getTime()) return true;
          return false;
        });
      },
      weekValues() {
        const self = this;
        if (!self.data) return null;
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setMonth(weekStart.getMonth(), weekStart.getDate() - 7);
        return self.data.filter((el) => {
          const hours = parseInt(el.data.time.split(':')[0], 10);
          const mins = parseInt(el.data.time.split(':')[1], 10);
          const d = new Date(el.data.date);
          d.setHours(hours, mins);
          if (d.getTime() > weekStart.getTime()) return true;
          return false;
        });
      },
      monthValues() {
        const self = this;
        if (!self.data) return null;
        const monthStart = new Date();
        monthStart.setHours(0, 0, 0, 0);
        monthStart.setMonth(monthStart.getMonth() - 1, monthStart.getDate());
        return self.data.filter((el) => {
          const hours = parseInt(el.data.time.split(':')[0], 10);
          const mins = parseInt(el.data.time.split(':')[1], 10);
          const d = new Date(el.data.date);
          d.setHours(hours, mins);
          if (d.getTime() > monthStart.getTime()) return true;
          return false;
        });
      },
    },
    methods: {
      initChart() {
        const self = this;
        const range = self.range;
        const common = {
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
        };
        const seriesCommon = {
          color: '#5FA81A',
          cursor: 'pointer',
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
          self.$highcharts.chart(self.$refs.weightChartDay, {
            ...common,
            series: [{
              ...seriesCommon,
              data: self.todayValues.map((el) => {
                const elDate = new Date(el.data.date);
                elDate.setHours(parseInt(el.data.time.split(':')[0], 10), parseInt(el.data.time.split(':')[1], 10));
                return {
                  y: parseInt(el.data.value, 10),
                  x: elDate,
                  id: self.data.indexOf(el),
                };
              }),
            }],
          });
        }
        if (range === 'week') {
          self.$highcharts.chart(self.$refs.weightChartWeek, {
            ...common,
            series: [{
              ...seriesCommon,
              data: self.weekValues.map((el) => {
                const elDate = new Date(el.data.date);
                elDate.setHours(parseInt(el.data.time.split(':')[0], 10), parseInt(el.data.time.split(':')[1], 10));
                return {
                  y: parseInt(el.data.value, 10),
                  x: elDate,
                  id: self.data.indexOf(el),
                };
              }),
            }],
          });
        }
        if (range === 'month') {
          self.$highcharts.chart(self.$refs.weightChartMonth, {
            ...common,
            series: [{
              ...seriesCommon,
              data: self.monthValues.map((el) => {
                const elDate = new Date(el.data.date);
                elDate.setHours(parseInt(el.data.time.split(':')[0], 10), parseInt(el.data.time.split(':')[1], 10));
                return {
                  y: parseInt(el.data.value, 10),
                  x: elDate,
                  id: self.data.indexOf(el),
                };
              }),
            }],
          });
        }
      },
    },
  };
</script>

