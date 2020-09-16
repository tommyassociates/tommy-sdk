<template>
  <f7-page class="time-clock-settings-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{ $t(`${addonConfig.package}.locked.unlock_device.title`) }}</f7-nav-title>
      <f7-nav-right>
        <!--        <f7-link icon-only class="back">-->
        <!--          <f7-icon f7="check" />-->
        <!--        </f7-link>-->
      </f7-nav-right>
    </f7-navbar>

    <f7-toolbar
      :style="toolbarStyle"
      class="time-clock-main-toolbar"
    >
      <f7-button
        raised
        fill
        @click="unlockDevice"
        class="time-clock-toolbar-button clock-on"
        :disabled="isDisabled"
      >{{ $t(`${addonConfig.package}.locked.unlock_device.button_text`) }}
      </f7-button>
    </f7-toolbar>

    <f7-page-content ref="pageContent">

      <f7-block-title class="time-clock-divider">
        {{ $t(`${addonConfig.package}.locked.unlock_device.enter_password_title`) }}
      </f7-block-title>

      <f7-list>
        <f7-list-item>
          <input type="text" name="pwd"
                 :value="emailOrPhone"
                 @input="onEmailOrPhoneChange"
                 :placeholder="$t(`${addonConfig.package}.locked.unlock_device.email_or_phone_field_placeholder_text`)">
        </f7-list-item>

        <f7-list-item>
          <input type="password" name="pwd"
                 :value="password"
                 @input="onPasswordChange"
                 :placeholder="$t(`${addonConfig.package}.locked.unlock_device.password_field_placeholder_text`)">
        </f7-list-item>
      </f7-list>


    </f7-page-content>


  </f7-page>
</template>

<script>
import addonConfig from "../../addonConfig";
import API from '../../api';
import config from 'tommy-core/src/tommy';


export default {
  name: "TimeclockLockedUnlockDevice",
  components: {},
  computed: {
    // ...mapGetters('account', ['canLockMiniProgram']),
    canLockMiniProgram() {
      return true;
    },
    toolbarStyle() {
      return {
        height: "74px"
      };
    },
    isDisabled() {
      const self = this;
      return self.password.length < 6;
    }
  },
  created() {
  },
  mounted() {
  },
  methods: {
    onEmailOrPhoneChange(e) {
      const self = this;
      self.emailOrPhone = e.target.value;
    },
    onPasswordChange(e) {
      const self = this;
      self.password = e.target.value;
    },

    unlockDevice() {
      const self = this;
      console.log(self.emailOrPhone);
      console.log(self.password);
      self.$api.login(self.emailOrPhone, self.password).then((response) => {
        console.log(JSON.stringify(response));
        console.log(response.token);
        console.log(self.$root.token);
        if (response.token === self.$root.token) {
          //TODO remove dev credentials.
          // const uuid = '79278561-E311-42E6-BB0E-B5168E6D54E1'; //window.device && window.device.uuid ? window.device.uuid : '';
          // const platform = 'mac'; //window.device && window.device.platform ? String(window.device.platform).toLowerCase() : '';
          const uuid = window.device && window.device.uuid ? window.device.uuid : '';
          const platform = window.device && window.device.platform ? String(window.device.platform).toLowerCase() : '';
          const environment = config.env || 'development';

          self.$api.getDevices({cache: false}).then(devices => {
            // const deviceToken = devices.find(device => device.uuid === uuid).map(device => device.token);
            const deviceToken = devices.find(device => device.uuid === uuid);

            console.log('devices', JSON.stringify(devices));

            console.log('uuid', uuid);
            console.log('deviceToken', JSON.stringify(deviceToken));

            const payload = {
              locked: false,
              uuid,
              platform,
              environment,
              name: '',
            };

            console.log('toggleIsMiniProgramLocked: payload', JSON.stringify(payload));

            if (deviceToken) {
              console.log('before unregisterDevice: ', deviceToken.id);
              self.$api.unregisterDevice(deviceToken.id).then(() => {
                console.log('before updateDevice');
                self.$api.updateDevice(payload).then((response) => {
                  payload.token = deviceToken.token;
                  console.log('toggleIsMiniProgramLocked: payload', JSON.stringify(payload));
                  console.log(JSON.stringify(response));
                  self.$root.miniProgramLocked.isLocked = payload.locked;
                  self.$root.miniProgramLocked.miniProgram = payload.name;
                  localStorage.miniProgramLocked = JSON.stringify(self.$root.miniProgramLocked);

                  self.$f7router.navigate(`${addonConfig.baseUrl}`);
                }).catch((error) => {
                  console.log('update device error');
                  console.log(JSON.stringify(error));
                });
              });
            } else {
              const randomString = (length) => [...Array(length)].map(() => (~~(Math.random() * 36)).toString(36)).join('');
              const token = randomString(21);
              payload.token = token;
              self.$api.updateDevice(payload).then((response) => {
                console.log(JSON.stringify(response));
                self.$root.miniProgramLocked.isLocked = payload.locked;
                self.$root.miniProgramLocked.miniProgram = payload.name;
                localStorage.miniProgramLocked = JSON.stringify(self.$root.miniProgramLocked);

                self.$f7router.navigate(`${addonConfig.baseUrl}`);
              }).catch((error) => {
                console.log(JSON.stringify(error));
              });
            }

          }).catch((error) => {
            console.log(JSON.stringify(error));
          });


        }
      });
    },



  },
  data() {
    return {
      addonConfig,
      hasActorId: API.actorId,
      permissions: [],
      emailOrPhone: '',
      password: '',

      settings: {
        miniProgram: {
          isLocked: false,
          miniProgram: '',
        },
      },
    };
  }
};
</script>
