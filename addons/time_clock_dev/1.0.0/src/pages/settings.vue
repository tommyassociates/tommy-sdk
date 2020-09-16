<template>
  <f7-page class="time-clock-settings-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{ $t(`${addonConfig.package}.settings.title`) }}</f7-nav-title>
    </f7-navbar>

    <f7-page-content ref="pageContent">

      <template v-if="canLockMiniProgram">
        <f7-block-title class="time-clock-divider">{{ $t(`${addonConfig.package}.settings.lock_mini_program_title`) }}
        </f7-block-title>
        <f7-list>
          <f7-list-item>
            <span>{{ $t(`${addonConfig.package}.settings.lock_mini_program_toggle`) }}</span>
            <f7-toggle @toggle:change="toggleIsMiniProgramLocked" :checked="settings.miniProgramLocked.isLocked"></f7-toggle>
          </f7-list-item>
        </f7-list>
      </template>
    </f7-page-content>
  </f7-page>
</template>

<script>
import addonConfig from "../addonConfig";
import API from '../api';
import config from 'tommy-core/src/tommy';

import {mapGetters} from 'vuex';

export default {
  name: "TimeClockSettings",
  components: {
    // GroupPopupCmp,
    // SearchCmp,
    // TagCmp,
  },
  computed: {
    // ...mapGetters('account', ['canLockMiniProgram']),
    canLockMiniProgram() {
      return true;
    }
  },
  methods: {

    toggleIsMiniProgramLocked(isLocked) {
      const self = this;
      const name = self.addonConfig.package;

      //TODO : Remove debug.
      // const uuid = 'MAC---79278561-E311-42E6-BB0E-B5168E6D54E1';
      // const platform = 'mac';

      const uuid = window.device && window.device.uuid ? window.device.uuid : '';
      const platform = window.device && window.device.platform ? String(window.device.platform).toLowerCase() : '';

      const environment = config.env || 'development';


      self.$api.getDevices({cache: false}).then(devices => {
        const deviceToken = devices.find(device => device.uuid === uuid);

        const payload = {
          locked: isLocked,
          uuid,
          platform,
          environment,
        };

        payload.name = isLocked ? name : '';

        if (deviceToken) {
          self.$api.unregisterDevice(deviceToken.id).then((response) => {
            self.$api.getDevices({cache: false}).then(devices => {
              const randomString = (length) => [...Array(length)].map(() => (~~(Math.random() * 36)).toString(36)).join('');
              const token = randomString(21);
              payload.token = token;
              self.$api.updateDevice(payload).then((response) => {
                self.$root.miniProgramLocked.isLocked = payload.locked;
                self.$root.miniProgramLocked.miniProgram = payload.name;
                localStorage.miniProgramLocked = JSON.stringify(self.$root.miniProgramLocked);

                if (isLocked) {
                  self.$f7router.navigate(`${addonConfig.baseUrl}locked/enter-pin/`);
                }
              });
            });
          });
        } else {
          const randomString = (length) => [...Array(length)].map(() => (~~(Math.random() * 36)).toString(36)).join('');
          const token = randomString(21);
          payload.token = token;
          self.$api.updateDevice(payload).then((response) => {
            self.$root.miniProgramLocked.isLocked = payload.locked;
            self.$root.miniProgramLocked.miniProgram = payload.name;
            localStorage.miniProgramLocked = JSON.stringify(self.$root.miniProgramLocked);

            if (isLocked) {
              self.$f7router.navigate(`${addonConfig.baseUrl}locked/enter-pin/`);
            }
          }).catch((error) => {
            console.log(JSON.stringify(error));
          });
        }

      }).catch((error) => {
        console.log(JSON.stringify(error));
      });
    },

  },
  data() {
    const miniProgramLocked = JSON.parse(localStorage.miniProgramLocked);
    return {
      addonConfig,
      hasActorId: API.actorId,
      permissions: [],

      settings: {
        miniProgramLocked: {
          isLocked: miniProgramLocked.isLocked,
          miniProgram: miniProgramLocked.miniProgram,
        },
      },

    };
  }
};
</script>
