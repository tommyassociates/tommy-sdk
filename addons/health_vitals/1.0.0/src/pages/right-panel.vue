<template>
  <f7-panel right cover class="health-vitals-panel">
    <f7-view :init="false">
      <f7-page>
        <f7-navbar>
          <f7-nav-left>
            <f7-link panel-close><i class="material-icons md-36">keyboard_arrow_left</i></f7-link>
          </f7-nav-left>
        </f7-navbar>
        <f7-list no-hairlines class="health-vitals-panel-list">
          <f7-list-item
            :title="$t('health_vitals.blood_glucose.title')"
            link="/health_vitals/blood_glucose/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}blood_glucose/icon.png`" slot="media">
          </f7-list-item>
          <f7-list-item
            :title="$t('health_vitals.blood_pressure.title')"
            link="/health_vitals/blood_pressure/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}blood_pressure/icon.png`" slot="media">
          </f7-list-item>
          <f7-list-item
            :title="$t('health_vitals.heart_rate.title')"
            link="/health_vitals/heart_rate/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}heart_rate/icon.png`" slot="media">
          </f7-list-item>
          <f7-list-item
            :title="$t('health_vitals.height.title')"
            link="/health_vitals/height/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}height/icon.png`" slot="media">
          </f7-list-item>
          <!-- <f7-list-item
            :title="$t('health_vitals.immunisations.title')"
            link="/health_vitals/immunisations/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}immunisations/icon.png`" slot="media">
          </f7-list-item> -->
          <!-- <f7-list-item
            :title="$t('health_vitals.medication_reminder.title')"
            link="/health_vitals/medication_reminder/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}medication_reminder/icon.png`" slot="media">
          </f7-list-item> -->
          <!-- <f7-list-item
            :title="$t('health_vitals.pedometer.title')"
            link="/health_vitals/pedometer/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}pedometer/icon.png`" slot="media">
          </f7-list-item> -->
          <f7-list-item
            :title="$t('health_vitals.temperature.title')"
            link="/health_vitals/temperature/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}temperature/icon.png`" slot="media">
          </f7-list-item>
          <f7-list-item
            :title="$t('health_vitals.water_tracker.title')"
            link="/health_vitals/water_tracker/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}water_tracker/icon.png`" slot="media">
          </f7-list-item>
          <f7-list-item
            :title="$t('health_vitals.weight.title')"
            link="/health_vitals/weight/"
            panel-close
          >
            <img :src="`${$addonAssetsUrl}weight/icon.png`" slot="media">
          </f7-list-item>
        </f7-list>
      </f7-page>
    </f7-view>
  </f7-panel>
</template>
<script>
  export default {};
</script>
