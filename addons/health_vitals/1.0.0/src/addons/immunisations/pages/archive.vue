<template>
  <f7-page :class="`vitals-${vitalsElement}-archive-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
    </f7-navbar>

    <div :class="`vitals-element-index-no-data vitals-${vitalsElement}-index-no-data`" v-if="data && !data.length">
      <i :class="`vitals-element-index-no-data-img vitals-${vitalsElement}-index-no-data-img`"></i>
    </div>

    <div :class="`vitals-element-index-cards vitals-${vitalsElement}-index-cards`" v-if="data && data.length">
      <a
        v-for="vaccine in orderedData"
        :key="vaccine.id"
        href="#"
        class="immunisations-card"
        @click="$f7router.navigate('/health_vitals/immunisations/details/', {
          props: {
            vaccine,
          },
        })"
      >
        <div class="immunisations-card-icon" :class="{
          injected: isInjected(vaccine),
          overdue: isOverDue(vaccine),
        }"></div>
        <div class="immunisations-card-content">
          <div class="immunisations-card-name">{{vaccine.data.name}}</div>
          <div class="immunisations-card-date">{{$moment(vaccine.data.scheduledDate || vaccine.data.sheduledDate).format('DD MMM, YYYY')}}</div>
        </div>
        <f7-icon f7="chevron_right" />
      </a>
    </div>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      vitalsElement: String,
    },
    data() {
      return {
        data: null,
      };
    },
    mounted() {
      const self = this;
      self.getData();
      self.$events.$on(`${self.vitalsElement}:updateRecords`, self.getData);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off(`${self.vitalsElement}:updateRecords`, self.getData);
    },
    computed: {
      orderedData() {
        if (!this.data) return null;
        return this.data.sort((a, b) => {
          const aDate = new Date(a.data.scheduledDate || a.data.sheduledDate).getTime();
          const bDate = new Date(b.data.scheduledDate || b.data.sheduledDate).getTime();
          if (aDate > bDate) return -1;
          return 1;
        });
      },
    },
    methods: {
      t(v, d) {
        return this.$t(`health_vitals.${this.vitalsElement}.archive.${v}`, d);
      },
      isOverDue(item) {
        const self = this;
        if (self.isInjected(item)) return false;
        const d = new Date();
        const needDate = new Date(item.data.scheduledDate || item.data.sheduledDate);
        return d.getTime() >= needDate.getTime();
      },
      isInjected(item) {
        return item.data.injected;
      },

      getData() {
        const self = this;
        API.getVaccines(self.$root.user).then((data) => {
          self.data = data.filter(v => v.data.archived);
        });
      },
    },
  };
</script>

