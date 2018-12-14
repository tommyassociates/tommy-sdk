<template>
  <f7-page id="health_vitals__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{t('title', 'Health Vitals')}}</f7-nav-title>
    </f7-navbar>

    <div class="health-vitals-cards">
      <div class="health-vitals-card health-vitals-card-red">
        <div class="health-vitals-card-title">{{t('vital_types.2')}}</div>
        <div class="health-vitals-card-subtitle">2 {{t('frequency_every_label')}} 2 {{t('frequency_options.2')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 5 {{t('between_and_label')}} 6</div>
        <div class="health-vitals-subcard health-vitals-subcard-red">
          <div class="health-vitals-subcard-title">Yesterday 18:36</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-soup.svg`" >
            </div>
            <div class="health-vitals-subcard-value">5.93 <sub>{{t('blood_glucose_units')}}</sub></div>
          </div>
        </div>
      </div>

      <div class="health-vitals-card">
        <div class="health-vitals-card-title">{{t('vital_types.4')}}</div>
        <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 1000 {{t('between_and_label')}} 3500</div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Yesterday 22:00</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-water.svg`" >
            </div>
            <div class="health-vitals-subcard-value">2680 <sub>{{t('water_units.5')}}</sub></div>
          </div>
        </div>
      </div>

      <div class="health-vitals-card">
        <div class="health-vitals-card-title">{{t('vital_types.0')}}</div>
        <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 80 {{t('between_and_label')}} 100</div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Yesterday 18:36</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-check.svg`" >
            </div>
            <span class="health-vitals-card-icon-text">{{t('taken')}}</span>
            <div class="health-vitals-subcard-value">100%</div>
          </div>
        </div>
      </div>

      <div class="health-vitals-card health-vitals-card-red">
        <div class="health-vitals-card-title">{{t('vital_types.5')}}</div>
        <div class="health-vitals-card-subtitle">2 {{t('frequency_every_label')}} {{t('frequency_options.2')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 35 {{t('between_and_label')}} 37.7</div>
        <div class="health-vitals-subcard health-vitals-subcard-red">
          <div class="health-vitals-subcard-title">Today 14:22</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-temp.svg`" >
            </div>
            <div class="health-vitals-subcard-value">38.2 <sub>{{t('body_temperature_units.0')}}</sub></div>
          </div>
        </div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Today 08:36</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-temp.svg`" >
            </div>
            <div class="health-vitals-subcard-value">36.6 <sub>{{t('body_temperature_units.0')}}</sub></div>
          </div>
        </div>
      </div>

      <div class="health-vitals-card">
        <div class="health-vitals-card-title">{{t('vital_types.6')}}</div>
        <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 2000 {{t('between_and_label')}} 8000</div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Today 14:22</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-foot.svg`" >
            </div>
            <div class="health-vitals-subcard-value">2534 <sub>{{t('pedometer_units')}}</sub></div>
          </div>
        </div>
      </div>

      <div class="health-vitals-card">
        <div class="health-vitals-card-title">{{t('vital_types.7')}}</div>
        <div class="health-vitals-card-subtitle">1 {{t('frequency_every_label')}} 2 {{t('frequency_options.2')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 160 {{t('between_and_label')}} 170</div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Yesterday 16:00</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-person.svg`" >
            </div>
            <div class="health-vitals-subcard-value">165 <sub>{{t('height_units.0')}}</sub></div>
          </div>
        </div>
      </div>

      <div class="health-vitals-card">
        <div class="health-vitals-card-title">{{t('vital_types.3')}}</div>
        <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 60 {{t('between_and_label')}} 120</div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Yesterday 22:00</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-yoga.svg`" >
            </div>
            <div class="health-vitals-subcard-value">80 <sub>{{t('heart_rate_units')}}</sub></div>
          </div>
        </div>
      </div>

      <div class="health-vitals-card">
        <div class="health-vitals-card-title">{{t('vital_types.1')}}</div>
        <div class="health-vitals-card-subtitle">2 {{t('frequency_every_label')}} {{t('frequency_options.2')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 100/70 {{t('between_and_label')}} 140/90</div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Today 14:32</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-subcard-value">120/82</div>
            <div class="health-vitals-subcard-value"><sub>{{t('blood_pressure_units')}}</sub></div>
          </div>
        </div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Today 18:40</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-subcard-value">108/73</div>
            <div class="health-vitals-subcard-value"><sub>{{t('blood_pressure_units')}}</sub></div>
          </div>
        </div>
      </div>

      <div class="health-vitals-card">
        <div class="health-vitals-card-title">{{t('vital_types.8')}}</div>
        <div class="health-vitals-card-subtitle">{{t('frequency_everyday_label')}}</div>
        <div class="health-vitals-card-subtitle">{{t('between_label')}} 60 {{t('between_and_label')}} 85</div>
        <div class="health-vitals-subcard">
          <div class="health-vitals-subcard-title">Yesterday 16:00</div>
          <div class="health-vitals-subcard-content">
            <div class="health-vitals-card-icon">
              <img :src="`${$addonAssetsUrl}icon-weight.svg`" >
            </div>
            <div class="health-vitals-subcard-value">98 <sub>{{t('weight_units.0')}}</sub></div>
          </div>
        </div>
      </div>
    </div>

  </f7-page>
</template>
<script>
  export default {
    data() {
      return {};
    },
    methods: {
      t(v) {
        return this.$t(`health_vitals.index.${v}`);
      }
    },
  };
</script>

