<template>
  <f7-page id="health_vitals__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{t('title', 'Health Vitals')}}</f7-nav-title>
    </f7-navbar>

    <div class="health-vitals-cards">
      <div class="health-vitals-card health-vitals-user-card" v-if="user">
        <tommy-circle-avatar v-if="user" :data="user" />
        <div class="health-vitals-user-card-content">
          <div class="name">{{user.first_name}} {{user.last_name}}</div>
          <div class="props">
            <div class="prop" v-if="userAge">
              <div class="prop-label">{{t('profile_age_label')}}</div>
              <div class="prop-value">{{userAge}}</div>
            </div>
          </div>
        </div>
      </div>
      <!--
        ======= BLOOD GLUCOSE =======
      -->

      <!-- <div class="health-vitals-card health-vitals-card-red">
        <div class="health-vitals-card-title">{{t('vital_types.2')}}</div>
        <div class="health-vitals-card-subtitle">2 {{t('frequency_every_label')}} 2 {{t('frequency_options.2')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 5 {{t('between_and_label')}} 6</div>
        <div class="health-vitals-subcard health-vitals-subcard-red">
          <div class="health-vitals-subcard-title">{{$t('health_vitals.dates.yesterday')}} 18:36</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-soup.svg`" >
            </div>
            <div class="health-vitals-subcard-value">5.93 <sub>{{t('blood_glucose_units')}}</sub></div>
          </div>
        </div>
      </div> -->
      <div class="health-vitals-card" v-if="blood_glucose">
        <div class="health-vitals-card-title">{{t('vital_types.2')}}</div>
        <!-- <div class="health-vitals-card-subtitle">2 {{t('frequency_every_label')}} 2 {{t('frequency_options.2')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 5 {{t('between_and_label')}} 6</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(blood_glucose.date).format('DD MMM YYYY')}} {{blood_glucose.time}}</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}blood-glucose-icon-${blood_glucose.state}.svg`" >
            </div>
            <div class="health-vitals-subcard-value">{{blood_glucose.value}} <sub>{{t('blood_glucose_units')}}</sub></div>
          </div>
        </div>
      </div>

      <!--
        ======= WATER TRACKER =======
      -->

      <div class="health-vitals-card" v-if="water_tracker">
        <div class="health-vitals-card-title">{{t('vital_types.4')}}</div>
        <!-- <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 1000 {{t('between_and_label')}} 3500</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(water_tracker.date).format('DD MMM YYYY')}} {{water_tracker.time}}</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img v-if="water_tracker.value < 200" :src="`${$addonAssetsUrl}water-tracker-icon-cup.svg`" >
              <img v-else-if="water_tracker.value < 350" :src="`${$addonAssetsUrl}water-tracker-icon-glass.svg`" >
              <img v-else :src="`${$addonAssetsUrl}water-tracker-icon-bottle.svg`" >
            </div>
            <div class="health-vitals-subcard-value">{{water_tracker.value}} <sub>{{t('water_units.5')}}</sub></div>
          </div>
        </div>
      </div>

      <!--
        ======= MEDICATION REMINDER =======
      -->

      <div class="health-vitals-card" v-if="medication_reminder">
        <div class="health-vitals-card-title">{{t('vital_types.0')}}</div>
        <!-- <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 80 {{t('between_and_label')}} 100</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(medication_reminder.date).format('DD MMM YYYY')}}</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-check.svg`" v-if="medication_reminder.takenPercentage === 100">
              <f7-gauge
                v-else
                :size="46"
                :value="medication_reminder.takenPercentage / 100"
                border-bg-color="#FAE1C9"
                border-color="#FF4500"
                :border-width="8"
              />
            </div>
            <span class="health-vitals-card-icon-text">{{t('taken', 'Taken')}}</span>
            <div class="health-vitals-subcard-value">{{medication_reminder.takenPercentage}}%</div>
          </div>
        </div>
      </div>

      <!--
        ======= TEMPERATURE =======
      -->

      <!-- <div class="health-vitals-card health-vitals-card-red">
        <div class="health-vitals-card-title">{{t('vital_types.5')}}</div>
        <div class="health-vitals-card-subtitle">2 {{t('frequency_every_label')}} {{t('frequency_options.2')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 35 {{t('between_and_label')}} 37.7</div>
        <div class="health-vitals-subcard health-vitals-subcard-red">
          <div class="health-vitals-subcard-title">{{$t('health_vitals.dates.today')}} 14:22</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-temp.svg`" >
            </div>
            <div class="health-vitals-subcard-value">38.2 <sub>{{t('body_temperature_units.0')}}</sub></div>
          </div>
        </div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$t('health_vitals.dates.today')}} 08:36</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-temp.svg`" >
            </div>
            <div class="health-vitals-subcard-value">36.6 <sub>{{t('body_temperature_units.0')}}</sub></div>
          </div>
        </div>
      </div> -->
      <div class="health-vitals-card" v-if="temperature">
        <div class="health-vitals-card-title">{{t('vital_types.5')}}</div>
        <!-- <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 2000 {{t('between_and_label')}} 8000</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(temperature.date).format('DD MMM YYYY')}} {{temperature.time}}</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}temperature-icon.svg`" >
            </div>
            <div class="health-vitals-subcard-value">{{temperature.value}} <sub>{{t('body_temperature_units.0')}}</sub></div>
          </div>
        </div>
      </div>

      <!--
        ======= PEDOMETER =======
      -->
      <div class="health-vitals-card" v-if="pedometer">
        <div class="health-vitals-card-title">{{t('vital_types.6')}}</div>
        <!-- <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 2000 {{t('between_and_label')}} 8000</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(pedometer.date).format('DD MMM YYYY')}} {{pedometer.time}}</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}pedometer-icon.svg`" >
            </div>
            <div class="health-vitals-subcard-value">{{pedometer.value}} <sub>{{t('pedometer_units')}}</sub></div>
          </div>
        </div>
      </div>

      <!--
        ======= HEIGHT =======
      -->
      <div class="health-vitals-card" v-if="height">
        <div class="health-vitals-card-title">{{t('vital_types.7')}}</div>
        <!-- <div class="health-vitals-card-subtitle">1 {{t('frequency_every_label')}} 2 {{t('frequency_options.2')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 160 {{t('between_and_label')}} 170</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(height.date).format('DD MMM YYYY')}} {{height.time}}</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}height-icon.svg`" >
            </div>
            <div class="health-vitals-subcard-value">{{height.value}} <sub>{{t('height_units.0')}}</sub></div>
          </div>
        </div>
      </div>

      <!--
        ======= HEART RATE =======
      -->
      <div class="health-vitals-card" v-if="heart_rate">
        <div class="health-vitals-card-title">{{t('vital_types.3')}}</div>
        <!-- <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 60 {{t('between_and_label')}} 120</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(heart_rate.date).format('DD MMM YYYY')}} {{heart_rate.time}}</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}heart-rate-icon-${heart_rate.state}.svg`" >
            </div>
            <div class="health-vitals-subcard-value">{{heart_rate.value}} <sub>{{t('heart_rate_units')}}</sub></div>
          </div>
        </div>
      </div>

      <!--
        ======= BLOOD PRESSURE =======
      -->
      <!-- <div class="health-vitals-card">
        <div class="health-vitals-card-title">{{t('vital_types.1')}}</div>
        <div class="health-vitals-card-subtitle">2 {{t('frequency_every_label')}} {{t('frequency_options.2')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 100/70 {{t('between_and_label')}} 140/90</div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$t('health_vitals.dates.today')}} 14:32</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-subcard-value">120/82</div>
            <div class="health-vitals-subcard-value"><sub>{{t('blood_pressure_units')}}</sub></div>
          </div>
        </div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$t('health_vitals.dates.today')}} 18:40</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-subcard-value">108/73</div>
            <div class="health-vitals-subcard-value"><sub>{{t('blood_pressure_units')}}</sub></div>
          </div>
        </div>
      </div> -->

      <div class="health-vitals-card" v-if="blood_pressure">
        <div class="health-vitals-card-title">{{t('vital_types.1')}}</div>
        <!-- <div class="health-vitals-card-subtitle">2 {{t('frequency_every_label')}} {{t('frequency_options.2')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 100/70 {{t('between_and_label')}} 140/90</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(blood_pressure.date).format('DD MMM YYYY')}} {{blood_pressure.time}}</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-subcard-value">{{blood_pressure.value[0]}}/{{blood_pressure.value[1]}}</div>
            <div class="health-vitals-subcard-value"><sub>{{t('blood_pressure_units')}}</sub></div>
          </div>
        </div>
      </div>

      <!--
        ======= WEIGHT =======
      -->
      <div class="health-vitals-card" v-if="weight">
        <div class="health-vitals-card-title">{{t('vital_types.8')}}</div>
        <!-- <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div> -->
        <!-- <div class="health-vitals-card-subtitle">{{t('between_label')}} 60 {{t('between_and_label')}} 85</div> -->
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">{{$moment(weight.date).format('DD MMM YYYY')}} {{weight.time}}</div>
          <!-- <div class="health-vitals-subcard-title">{{$t('health_vitals.dates.yesterday')}} 16:00</div> -->
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}weight-icon.svg`" >
            </div>
            <div class="health-vitals-subcard-value">{{weight.value}} <sub>{{t('weight_units.0')}}</sub></div>
          </div>
        </div>
      </div>
    </div>

  </f7-page>
</template>
<script>
  import API from '../api';

  const cachedVitals = {
    water_tracker: null,
    temperature: null,
    pedometer: null,
    height: null,
    weight: null,
    heart_rate: null,
    blood_pressure: null,
    blood_glucose: null,
    medication_reminder: null,
  };

  export default {
    data() {
      const self = this;
      return {
        actorId: self.$f7route.query.actor_id,
        user: null,

        water_tracker: cachedVitals.water_tracker,
        temperature: cachedVitals.temperature,
        pedometer: cachedVitals.pedometer,
        height: cachedVitals.height,
        weight: cachedVitals.weight,
        heart_rate: cachedVitals.heart_rate,
        blood_pressure: cachedVitals.blood_pressure,
        blood_glucose: cachedVitals.blood_glucose,
        medication_reminder: cachedVitals.medication_reminder,
      };
    },
    mounted() {
      const self = this;
      if (self.actorId) {
        API.actorId = parseInt(self.actorId, 10);
        self.$api.getContact(self.actorId).then((response) => {
          self.user = response;
        });
      } else {
        self.user = self.$root.user;
        delete API.actorId;
        delete API.actor;
      }
      this.getData();
    },
    computed: {
      userAge() {
        const self = this;
        if (!self.user) return;
        const dob = self.user.dob;
        if (!dob) return;
        const dobDate = self.$moment(new Date(dob));
        const nowDate = self.$moment(new Date());
        return nowDate.diff(dobDate, 'years');
      },
    },
    methods: {
      t(v, d) {
        return this.$t(`health_vitals.index.${v}`, d);
      },
      getData() {
        const self = this;
        API.getWaterTracker(self.$root.user).then((res) => {
          if (!res || !res.length || !res[0].data) return;
          self.water_tracker = res[0].data;
          cachedVitals.water_tracker = self.water_tracker;
        });
        API.getTemperature(self.$root.user).then((res) => {
          if (!res || !res.length || !res[0].data) return;
          self.temperature = res[0].data;
          cachedVitals.temperature = self.temperature;
        });
        API.getPedometer(self.$root.user).then((res) => {
          if (!res || !res.length || !res[0].data) return;
          self.pedometer = res[0].data;
          cachedVitals.pedometer = self.pedometer;
        });
        API.getHeight(self.$root.user).then((res) => {
          if (!res || !res.length || !res[0].data) return;
          self.height = res[0].data;
          cachedVitals.height = self.height;
        });
        API.getWeight(self.$root.user).then((res) => {
          if (!res || !res.length || !res[0].data) return;
          self.weight = res[0].data;
          cachedVitals.weight = self.weight;
        });
        API.getHeartRate(self.$root.user).then((res) => {
          if (!res || !res.length || !res[0].data) return;
          self.heart_rate = res[0].data;
          cachedVitals.heart_rate = self.heart_rate;
        });
        API.getBloodPressure(self.$root.user).then((res) => {
          if (!res || !res.length || !res[0].data) return;
          self.blood_pressure = res[0].data;
          cachedVitals.blood_pressure = self.blood_pressure;
        });
        API.getBloodGlucose(self.$root.user).then((res) => {
          if (!res || !res.length || !res[0].data) return;
          self.blood_glucose = res[0].data;
          cachedVitals.blood_glucose = self.blood_glucose;
        });
        API.getMedicationReminder(self.$root.user).then((res) => {
          if (!res) return;
          self.medication_reminder = res;
          cachedVitals.medication_reminder = self.medication_reminder;
        }).catch(() => {});
      },
    },
  };
</script>

