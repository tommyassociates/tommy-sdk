<template>
  <f7-page name="nurse_booking__nurse-list" id="nurse_booking__nurse-list">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t(`nurse_booking.nurse_list.title`)}}</f7-nav-title>
    </f7-navbar>

    <div class="nurse-list" v-if="nurses">
      <ul>
        <li v-for="nurse in nurses" :key="nurse.id" :class="{'nurse-selected': selectedNurseId === nurse.id}">
          <a class="nurse-content-wrap" @click="selectNurse(nurse)">
            <div class="nurse-media" :style="`background-image: url(${nurse.icon_url || ''})`"></div>
            <div class="nurse-content">
              <div class="nurse-name">{{nurse.first_name}} {{nurse.last_name}}</div>
              <!-- <div class="nurse-level">Level 1</div> -->
            </div>
            <!-- <div class="nurse-extra">
              <div class="nurse-percentage">100%</div>
            </div> -->
          </a>
        </li>
        <!--
        <li>
          <a class="nurse-content-wrap" :href="`${$addonAssetsUrl}nurse-details.html`">
            <div class="nurse-media">
              <span class="nurse-crown-badge"></span>
              <img :src="`${$addonAssetsUrl}demo-nurse.png`">
            </div>
            <div class="nurse-content">
              <div class="nurse-name">Mary Z.</div>
              <div class="nurse-level">Level 3</div>
            </div>
            <div class="nurse-extra">
              <div class="nurse-percentage">100%</div>
              <div class="nurse-bonus">+¥200</div>
            </div>
            <span class="nurse-delux-badge"></span>
          </a>
        </li>
        <li class="nurse-inactive">
          <a class="nurse-content-wrap" :href="`${$addonAssetsUrl}nurse-details.html`">
            <div class="nurse-media">
              <img :src="`${$addonAssetsUrl}demo-nurse.png`">
            </div>
            <div class="nurse-content">
              <div class="nurse-name">Mary Liu</div>
              <div class="nurse-level">Level 1</div>
              <div class="nurse-busy">busy at 10:00-13:30</div>
            </div>
            <div class="nurse-extra">
              <div class="nurse-percentage">100%</div>
            </div>
          </a>
        </li>
        -->
      </ul>
    </div>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        nurses: null,
        selectedNurseId: this.$f7route.query.nurse_id ? parseInt(this.$f7route.query.nurse_id, 10) : undefined,
      };
    },
    mounted() {
      const self = this;
      API.getNurseList(self.$root.team.id).then((nurses) => {
        if (nurses.length === self.$root.teamMembers.length) {
          self.nurses = self.$root.teamMembers.filter(m => m.tags.indexOf('Available For Work') >= 0);
        } else {
          self.nurses = nurses;
        }
      });
    },
    methods: {
      selectNurse(nurse) {
        const self = this;
        self.selectedNurseId = nurse.id;
        API.cache.booking.nurse = nurse;

        if (self.$f7route.query.back) {
          self.$f7router.back();
        } else {
          self.$f7router.navigate('/nurse_booking/order-confirm/');
        }
      },

    },
  };
</script>

