<template>
  <f7-page :class="`vitals-${vitalsElement}-plan-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
    </f7-navbar>

    <f7-fab :href="`/${addon}/add/`" :class="`vitals-element-fab vitals-${vitalsElement}-fab`">
      <f7-icon f7="add"></f7-icon>
    </f7-fab>

    <a
      class="medication-card"
      v-for="med in medications"
      :key="med.id"
      :href="`/${addon}/edit/${med.id}/`"
    >
      <div class="medication-card-date">{{$moment(med.data.startDate).format('D MMM YYYY')}} - {{$moment(med.data.endDate).format('D MMM YYYY')}}</div>
      <div class="medication-card-content">
        <div class="medication-card-icon"></div>
        <div class="medication-card-name">{{med.data.name}}</div>
      </div>
    </a>
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
        medications: null,
      };
    },
    mounted() {
      const self = this;
      self.getMedications();
      self.$events.$on(`${self.addon}:updateRecords`, self.getMedications);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off(`${self.addon}:updateRecords`, self.getMedications);
    },
    methods: {
      t(v, d) {
        return this.$t(`${this.addon}.medication_plan.${v}`, d);
      },
      getMedications() {
        const self = this;
        API.getMedications(self.$root.user).then((medications) => {
          self.medications = medications;
        });
      },
    },
  };
</script>

