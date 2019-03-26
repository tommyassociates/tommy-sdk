<template>
  <f7-page id="vitals_element__history" :class="`vitals-${vitalsElement}-history-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
    </f7-navbar>

    <div class="medication-history-header">
      <template v-if="data && takenData">
        <div class="medication-history-header-icon" :class="{'not-taken': !isLastDayTaken}"></div>
        <div class="medication-history-header-text">{{isLastDayTaken ? t('notice_text.0') : t('notice_text.1')}}</div>
      </template>
    </div>
    <div
      class="medication-history-card"
      v-for="(dateItems, key) in orderedData"
      :key="key"
      @click="toggleCard(key)"
    >
      <div class="medication-history-card-date">
        <span>{{$moment(key).format('DD MMM YYYY')}}</span>
        <span v-if="isOpenedCard(key)">{{percentageTaken(dateItems)}}%</span>
        <f7-icon :f7="isOpenedCard(key) ? 'chevron_up' : 'chevron_right'" size="16" />
      </div>
      <div class="medication-history-card-content" v-if="!isOpenedCard(key)">
        <div class="medication-history-card-icon taken" v-if="percentageTaken(dateItems) === 100"></div>
        <f7-gauge
          v-else
          :size="46"
          :value="percentageTaken(dateItems) / 100"
          border-bg-color="#FAE1C9"
          border-color="#FF4500"
          :border-width="8"
        />
        <div class="medication-history-card-title">{{t('dosage_status')}}</div>
        <div class="medication-history-card-value">{{percentageTaken(dateItems)}}%</div>
      </div>
      <template v-else>
        <div
          class="medication-history-card-content"
          v-for="(item, index) in dateItems"
          :key="index"
        >
          <div class="medication-history-card-icon" :class="{
            taken: isTaken(item),
            'not-taken': isNotTaken(item),
          }"></div>
          <div class="medication-history-card-title">{{item.name}}</div>
          <div class="medication-history-card-value">{{item.time}}</div>
        </div>
      </template>

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
        openedCards: [],
      };
    },
    mounted() {
      const self = this;
      self.getData();
    },
    computed: {
      isLastDateTaken() {
        const self = this;
        const today = self.$moment().format('YYYY-MM-DD');
        if (!self.orderedData) return true;
        if (!self.orderedData[today]) return true;
        return self.percentageTaken(self.orderedData[today]) === 100;
      },
      orderedData() {
        const self = this;
        if (!self.data) return;
        const data = {};
        self.data.forEach((medication) => {
          const startDate = new Date(medication.data.startDate);
          if (startDate.getTime() > new Date().getTime()) return;
          let endDate = new Date(medication.data.endDate);
          if (endDate.getTime() > new Date().getTime()) {
            endDate = new Date();
            endDate.setHours(0, 0, 0, 0);
          }
          const days = (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
          for (let i = 0; i < days; i += 1) {
            const d = new Date(startDate).getTime() + i * (24 * 60 * 60 * 1000);
            const formatted = self.$moment(d).format('YYYY-MM-DD');
            if (!data[formatted]) data[formatted] = [];
            data[formatted].push(...medication.data.dosage.map(dose => ({
              id: medication.id,
              name: medication.data.name,
              time: dose.time,
            })));
          }
        });
        Object.keys(data).forEach((key) => {
          const dayData = data[key];
          dayData.sort((a, b) => {
            const aTime = parseInt(a.time.split(':')[0], 10) * 60 + parseInt(a.time.split(':')[1], 10);
            const bTime = parseInt(b.time.split(':')[0], 10) * 60 + parseInt(b.time.split(':')[1], 10);
            if (aTime < bTime) return -1;
            return 1;
          });
        });
        return data;
      },
    },
    methods: {
      isOpenedCard(key) {
        const self = this;
        return self.openedCards.indexOf(key) >= 0;
      },
      toggleCard(key) {
        const self = this;
        if (self.openedCards.indexOf(key) >= 0) {
          self.openedCards.splice(self.openedCards.indexOf(key), 1);
        } else {
          self.openedCards.push(key);
        }
      },
      percentageTaken(items) {
        const self = this;
        const takenItems = items.filter(item => self.isTaken(item));
        return Math.round(takenItems.length / items.length * 100);
      },
      isTaken(item) {
        const self = this;
        if (!self.takenData) return false;
        let taken;
        self.takenData.forEach((takenItem) => {
          if (taken) return;
          if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time) taken = takenItem.data.taken === true;
        });
        return taken;
      },
      isNotTaken(item) {
        const self = this;
        if (!self.takenData) return false;
        let notTaken;
        self.takenData.forEach((takenItem) => {
          if (notTaken) return;
          if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time) notTaken = takenItem.data.taken === false;
        });
        return notTaken;
      },
      getData() {
        const self = this;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        function getTaken() {
          return new Promise((resolve, reject) => {
            API.getTaken(self.$root.user).then((data) => {
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
          })
          .catch((err) => {
            console.log(err);
          });
      },
      t(v, d) {
        return this.$t(`${this.addon}.history.${v}`, d);
      },
    },
  };
</script>

