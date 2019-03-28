<template>
  <f7-page id="vitals_element__index" :class="`vitals-elment-index-page vitals-${vitalsElement}-index-page`" @page:beforein="onPageBeforeIn" @page:beforeout="onPageBeforeOut" @scroll.native.capture="onPageScroll">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link :href="`/${addon}/settings/`" icon-only>
          <i :class="`icon vitals-element-icon-settings vitals-${vitalsElement}-icon-settings`"></i>
        </f7-link>
        <f7-link :href="`/${addon}/history/`" icon-only :route-props="{ goalValue: settings ? settings.goal_value : 0 }">
          <i :class="`icon vitals-element-icon-chart vitals-${vitalsElement}-icon-chart`"></i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-fab :href="`/${addon}/plan/`" :class="`vitals-element-fab vitals-${vitalsElement}-fab`">
      <f7-icon f7="add"></f7-icon>
    </f7-fab>

    <div :class="`vitals-element-index-header vitals-${vitalsElement}-index-header`">
      <div class="vitals-medicaton_reminder-header-date">
        <span class="month">{{$moment().format('MMMM')}}</span>
        <span class="day">{{$moment().format('D')}}</span>
      </div>
    </div>

    <div :class="`vitals-element-index-no-data vitals-${vitalsElement}-index-no-data`" v-if="data && !todayData">
      <i :class="`vitals-element-index-no-data-img vitals-${vitalsElement}-index-no-data-img`"></i>
      <span>{{t('not_available')}}</span>
    </div>

    <div class="medication-index-cards" v-if="data && todayData">
      <div class="medication-index-card"
        v-for="(item, index) in todayData"
        :key="index"
      >
        <div class="medication-index-card-icon" :class="{
          taken: isTaken(item),
          'not-taken': isNotTaken(item),
          'need-to-take': isNeedToTake(item),
        }"></div>
        <div class="medication-index-card-content">
          <div class="medication-index-card-name">{{item.name}}</div>
          <div class="medication-index-card-dosage">{{item.value}} {{t(`dosage_unit.${item.unit}`)}}</div>
        </div>
        <div class="medication-index-card-time">{{item.time}}</div>
      </div>
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
        takenData: null,
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
      todayData() {
        const self = this;
        if (!self.data) return null;
        const today = new Date();
        const todayTime = today.getTime();
        const todayData = [];
        self.data.forEach((el) => {
          if (!el.data.reminder) return;
          const startDate = new Date(el.data.startDate).getTime();
          const endDate = new Date(el.data.endDate).getTime();
          if (todayTime >= startDate && todayTime <= endDate) {
            el.data.dosage.forEach((d) => {
              todayData.push({
                id: el.id,
                name: el.data.name,
                time: d.time,
                unit: d.unit,
                value: d.value,
              });
            });
          }
        });
        todayData.sort((a, b) => {
          const aTime = parseInt(a.time.split(':')[0], 10) * 60 + parseInt(a.time.split(':')[1], 10);
          const bTime = parseInt(b.time.split(':')[0], 10) * 60 + parseInt(b.time.split(':')[1], 10);
          if (aTime < bTime) return -1;
          return 1;
        });
        return todayData.length ? todayData : null;
      },
    },
    methods: {
      t(v, d) {
        return this.$t(`${this.addon}.index.${v}`, d);
      },
      getData() {
        const self = this;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        function getTaken() {
          return new Promise((resolve, reject) => {
            API.getTaken(self.$root.user, {
              dateFrom: today,
              dateTo: new Date(today.getTime() + 24 * 60 * 60 * 1000),
            }).then((data) => {
              resolve(data);
            }).catch((err) => {
              reject(err);
            });
          });
        }
        function getData() {
          return new Promise((resolve, reject) => {
            API.getMedications(self.$root.user).then((data) => {
              resolve(data);
            }).catch((err) => {
              reject(err);
            });
          });
        }
        Promise
          .all([getData(), getTaken()])
          .then(([data, takenData]) => {
            self.takenData = takenData;
            self.data = data;
            self.checkReminders();
          })
          .catch((err) => {
            console.log(err);
          });
      },
      isNeedToTake(item) {
        const self = this;
        const todayData = self.todayData;
        if (!todayData) return false;

        if (self.isTaken(item) || self.isNotTaken(item)) return false;
        const time = item.time.split(':').map(e => parseInt(e, 10));
        const d = new Date();
        const h = d.getHours();
        const m = d.getMinutes();
        let needToTake;
        if (h > time[0]) needToTake = true;
        else if (h === time[0] && m >= time[1]) needToTake = true;
        return needToTake;
      },
      isTaken(item) {
        const self = this;
        if (!self.takenData) return false;
        let taken;
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        self.takenData.forEach((takenItem) => {
          if (taken) return;
          const takenDate = new Date(takenItem.data.date || takenItem.start_at);
          takenDate.setHours(0, 0, 0, 0);
          if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time && todayDate.getTime() === takenDate.getTime() && takenItem.data.taken) {
            taken = true;
          }
        });
        return taken;
      },
      isNotTaken(item) {
        const self = this;
        if (!self.takenData) return false;
        let notTaken;
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        self.takenData.forEach((takenItem) => {
          if (notTaken) return;
          const takenDate = new Date(takenItem.data.date || takenItem.start_at);
          takenDate.setHours(0, 0, 0, 0);
          if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time && todayDate.getTime() === takenDate.getTime() && !takenItem.data.taken) {
            notTaken = true;
          }
        });
        return notTaken;
      },
      checkReminders() {
        const self = this;
        const todayData = self.todayData;
        if (!todayData) return;
        self.todayData.forEach((el) => {
          if (!self.isNeedToTake(el)) return;
          self.$f7.dialog.create({
            text: `
              <div class="text-align-center">
                <img src="${self.$addonAssetsUrl}remind.svg" height="80"/>
              </div>
              <p class="text-align-center">${self.$t('vitals_medication_reminder.medication_time.text')} ${el.name}</p>
            `,
            buttons: [
              {
                text: self.$t('vitals_medication_reminder.medication_time.snooze_button'),
                onClick() {
                  API.takeMedication(self.$root.user, el.id, el.time, false).then(() => {
                    self.getData();
                  });
                },
              },
              {
                text: self.$t('vitals_medication_reminder.medication_time.confirm_button'),
                bold: true,
                onClick() {
                  API.takeMedication(self.$root.user, el.id, el.time, true).then(() => {
                    self.getData();
                  });
                },
              },
            ],
          }).open();
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

