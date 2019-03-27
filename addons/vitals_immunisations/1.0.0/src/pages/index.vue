<template>
  <f7-page id="vitals_element__index" :class="`vitals-elment-index-page vitals-${vitalsElement}-index-page`" @page:beforein="onPageBeforeIn" @page:beforeout="onPageBeforeOut" @scroll.native.capture="onPageScroll">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link :href="`/${addon}/settings/`" icon-only>
          <i :class="`icon vitals-element-icon-settings vitals-${vitalsElement}-icon-settings`"></i>
        </f7-link>
        <f7-link :href="`/${addon}/history/`" icon-only>
          <i :class="`icon vitals-element-icon-chart vitals-${vitalsElement}-icon-chart`"></i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-fab :href="`/${addon}/add/`" :class="`vitals-element-fab vitals-${vitalsElement}-fab`">
      <f7-icon f7="add"></f7-icon>
    </f7-fab>

    <div :class="`vitals-element-index-header vitals-${vitalsElement}-index-header`">
      <div :class="`vitals-element-index-header-icon vitals-${vitalsElement}-index-header-icon`"></div>
      <div :class="`vitals-element-index-header-content vitals-${vitalsElement}-index-header-content`" v-if="data && closestVaccine">
        <div :class="`vitals-element-index-header-date vitals-${vitalsElement}-index-header-date`">{{t('next_label')}}</div>
        <div :class="`vitals-element-index-header-data vitals-${vitalsElement}-index-header-data`">{{daysDiff(closestVaccine)}}<span>{{t('days_label')}}</span></div>
        <div :class="`vitals-element-index-header-date vitals-${vitalsElement}-index-header-date`">{{$moment(closestVaccine.data.scheduledDate || closestVaccine.data.sheduledDate).format('DD MMM YYYY')}}, {{closestVaccine.data.name}}</div>
      </div>
      <div :class="`vitals-element-index-header-content vitals-${vitalsElement}-index-header-content`" v-if="data && !closestVaccine">
        <div :class="`vitals-element-index-header-data vitals-${vitalsElement}-index-header-data`">{{t('vital_label')}}</div>
      </div>
    </div>

    <div :class="`vitals-element-index-no-data vitals-${vitalsElement}-index-no-data`" v-if="data && !data.length">
      <i :class="`vitals-element-index-no-data-img vitals-${vitalsElement}-index-no-data-img`"></i>
      <span>{{t('not_available')}}</span>
    </div>

    <div :class="`vitals-element-index-cards vitals-${vitalsElement}-index-cards`" v-if="data && data.length">
      <a
        v-for="vaccine in orderedData"
        :key="vaccine.id"
        href="#"
        class="immunisations-card"
        @click="$f7router.navigate('/vitals_immunisations/details/', {
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
      addon: String,
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
      self.$events.$on(`${self.addon}:updateRecords`, self.getData);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off(`${self.addon}:updateRecords`, self.getData);
    },
    computed: {
      closestVaccine() {
        const self = this;
        if (!self.data) return null;
        const vaccines = [...self.data];
        vaccines.sort((a, b) => {
          const aDate = new Date(a.data.scheduledDate || a.data.sheduledDate).getTime();
          const bDate = new Date(b.data.scheduledDate || b.data.sheduledDate).getTime();
          if (a < b) return -1;
          return 1;
        });
        let closest;
        const today = new Date().getTime();
        vaccines.forEach((v) => {
          if (closest) return;
          const vDate = new Date(v.data.scheduledDate || v.data.sheduledDate).getTime();
          if (vDate > today) closest = v;
        })
        return closest;
      },
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
        return this.$t(`${this.addon}.index.${v}`, d);
      },
      daysDiff(vaccine) {
        const today = new Date().getTime();
        const target = new Date(vaccine.data.scheduledDate || vaccine.data.sheduledDate).getTime();
        return Math.ceil((target - today) / 1000 / 60 / 60 / 25);
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
      checkReminders() {
        const self = this;
        self.data.forEach((el) => {
          if (!self.isOverDue(el)) return;
          self.$f7.dialog.create({
            text: `
              <div class="text-align-center">
                <img src="${self.$addonAssetsUrl}remind.svg" height="85"/>
              </div>
              <p class="text-align-center">${self.$t('vitals_immunisations.due_alert.text')}<br><b>${el.data.name}</b></p>
            `,
            buttons: [
              {
                text: self.$t('vitals_immunisations.due_alert.confirm_button'),
              },
            ],
          }).open();
        });
      },
      getData() {
        const self = this;
        API.getVaccines(self.$root.user).then((data) => {
          self.data = data.filter(v => !v.data.archived);
          self.checkReminders();
        });
      },
      onPageScroll(e) {
        const self = this;
        const $pageContentEl = self.$$(e.target).closest('.page-content');
        if (!$pageContentEl.length) return;
        const scrollTop = $pageContentEl[0].scrollTop;
        if (scrollTop > 100) {
          self.$f7router.view.$navbarEl.removeClass(`vitals-element-index-navbar vitals-${self.vitalsElement}-index-navbar`);
        } else {
          self.$f7router.view.$navbarEl.addClass(`vitals-element-index-navbar vitals-${self.vitalsElement}-index-navbar`);
        }
      },
      onPageBeforeIn() {
        const self = this;
        self.$f7router.view.$navbarEl.addClass(`vitals-element-index-navbar vitals-${self.vitalsElement}-index-navbar`);
      },
      onPageBeforeOut() {
        const self = this;
        self.$f7router.view.$navbarEl.removeClass(`vitals-element-index-navbar vitals-${self.vitalsElement}-index-navbar`);
      },
    },
  };
</script>

