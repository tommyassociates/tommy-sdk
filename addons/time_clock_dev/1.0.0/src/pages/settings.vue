<template>
  <f7-page class="time-clock-settings-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{ $t(`${addonConfig.package}.settings.title`) }}</f7-nav-title>
      <f7-nav-right>
        <!--        <f7-link icon-only class="back">-->
        <!--          <f7-icon f7="check" />-->
        <!--        </f7-link>-->
      </f7-nav-right>
    </f7-navbar>

    <f7-page-content ref="pageContent">

      <template v-if="canLockMiniProgram">
        <f7-block-title class="time-clock-divider">{{ $t(`${addonConfig.package}.settings.lock_mini_program_title`) }}
        </f7-block-title>
        <f7-list>
          <f7-list-item>
            <span>{{ $t(`${addonConfig.package}.settings.lock_mini_program_toggle`) }}</span>
            <f7-toggle :checked="settings.miniProgram.isLocked"
                       @toggle:change="toggleIsMiniProgramLocked"></f7-toggle>
          </f7-list-item>
        </f7-list>
      </template>


      <!--
      <f7-block-title class="time-clock-divider">{{$t('time_clock.settings.required_title')}}</f7-block-title>
      <f7-list>
        <f7-list-item :title="$t('time_clock.settings.gps_label')" >
          <f7-toggle slot="after"></f7-toggle>
        </f7-list-item>
        <f7-list-item :title="$t('time_clock.settings.photo_label')" >
          <f7-toggle slot="after"></f7-toggle>
        </f7-list-item>
      </f7-list>

      <f7-block-title class="time-clock-divider">{{$t('time_clock.settings.who_can_edit_title')}}</f7-block-title>
      <f7-list class="message-list">
        <f7-list-item >
          <search-cmp @clickOpened="togglePopup(true)"></search-cmp>
        </f7-list-item>
        <f7-list-item >
          <tag-cmp
            :name="seeUser.name"
            @clearName="clearUser(true)"
          ></tag-cmp>
        </f7-list-item>
      </f7-list>

      <f7-block-title class="time-clock-divider">{{$t('time_clock.settings.who_can_clock_manually_title')}}</f7-block-title>
      <f7-block-title class="time-clock-divider">{{$t('time_clock.settings.who_can_clock_title')}}</f7-block-title>
      <f7-block-title class="time-clock-divider">{{$t('time_clock.settings.who_can_break_title')}}</f7-block-title>
-->

    </f7-page-content>

    <!-- Popup
    <group-popup-cmp
      :opened="customerPopupOpened"
      @closed="customerPopupOpened = false"
      :items="items"
      @checkedGroup="checkedGroup"
      :checkedId="checkedId"
    ></group-popup-cmp>
 -->

  </f7-page>
</template>

<script>
import addonConfig from "../config";
import API from '../api';
import config from 'tommy-core/src/tommy';

import {mapGetters} from 'vuex';
import AttendanceService from "../services/attendance-service";
// import GroupPopupCmp from '../components/group-popup.vue';
// import SearchCmp from '../components/search.vue';
// import TagCmp from '../components/tag.vue';

//import tagSelect from '../components/tag-select.vue';

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
  created() {
    console.log('SETTINGS - created');
  },
  mounted() {
    const self = this;
    console.log('SETTINGS - mounted');
    // self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_create_access', {
    //   resource_id: undefined,
    //   with_filters: true,
    // }).then((permission) => {
    //   permission.resource_id = undefined;
    //   self.permissions.push(permission);
    // });
    // self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_edit_access', {
    //   resource_id: undefined,
    //   with_filters: true,
    // }).then((permission) => {
    //   permission.resource_id = undefined;
    //   self.permissions.push(permission);
    // });

    // self.items = [
    //   {
    //     id: 1215,
    //     name: 'elder',
    //   },
    //   {
    //     id: 155,
    //     name: 'manager',
    //   },
    // ];


  },
  methods: {
    // saveListPermission(permission) {
    //   const self = this;
    //   self.$api.updateInstalledAddonPermission('wallet_accounts', permission.name, {
    //     resource_id: permission.resource_id,
    //     with_filters: true,
    //     filters: JSON.stringify(permission.filters),
    //   });
    // },
    // addListPermission(permission, tag) {
    //   const self = this;
    //   permission.filters.push(tag);
    //   self.saveListPermission(permission);
    // },
    // removeListPermission(permission, tag) {
    //   const self = this;
    //   permission.filters.splice(permission.filters.indexOf(tag), 1);
    //   self.saveListPermission(permission);
    // },

    toggleIsMiniProgramLocked(isLocked) {
      // console.log('SETTINGS - toggleIsMiniProgramLocked', isLocked);
      const self = this;
      const name = self.addonConfig.package;
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
          locked: isLocked,
          uuid,
          platform,
          environment,
        };

        payload.name = isLocked ? name : '';

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

              if (isLocked) {
                self.$f7router.navigate(`${addonConfig.baseUrl}locked/enter-code`);
              }
            }).catch((error) => {
              console.log('update device error');
              console.log(JSON.stringify(error));
            });
          });
        } else {
          const randomString = (length) => [ ...Array(length) ].map(() => (~~(Math.random() * 36)).toString(36)).join('');
          const token = randomString(21);
          payload.token = token;
          self.$api.updateDevice(payload).then((response) => {
            console.log(JSON.stringify(response));
            self.$root.miniProgramLocked.isLocked = payload.locked;
            self.$root.miniProgramLocked.miniProgram = payload.name;
            localStorage.miniProgramLocked = JSON.stringify(self.$root.miniProgramLocked);

            if (isLocked) {
              self.$f7router.navigate(`${addonConfig.baseUrl}locked/enter-code`);
            }
          }).catch((error) => {
            console.log(JSON.stringify(error));
          });
        }
        // new Promise((resolve) => {
        //   console.log('deviceToken', deviceToken);
        //   if (deviceToken) {
        //     self.$api.unregisterDevice(deviceToken).then(() => resolve());
        //   } else {
        //     resolve();
        //   }
        // }).then(() => {
        //   const payload = {
        //     locked: isLocked,
        //     uuid,
        //     platform,
        //     environment,
        //   };
        //
        //   payload.name = isLocked ? name : '';
        //
        //   console.log('toggleIsMiniProgramLocked: payload', JSON.stringify(payload));
        //
        //   self.$api.updateDevice(payload).then((response) => {
        //     console.log(JSON.stringify(response));
        //     self.$root.miniProgramLocked.isLocked = payload.locked;
        //     self.$root.miniProgramLocked.miniProgram = payload.name;
        //     localStorage.miniProgramLocked = JSON.stringify(self.$root.miniProgramLocked);
        //
        //     if (isLocked) {
        //       self.$f7router.navigate(`${addonConfig.baseUrl}locked/enter-code`);
        //     }
        //   }).catch((error) => {
        //     console.log(JSON.stringify(error));
        //   });
        // }).catch((error) => {
        //   console.log(JSON.stringify(error));
        // });
      }).catch((error) => {
        console.log(JSON.stringify(error));
      });
    },


//copied from broadcast.
//       clearUser(isSee) {
//         const user = {
//           id: null,
//           name: null,
//         };
//         if (isSee) {
//           this.seeUser = user;
//         } else {
//           this.sendUser = user;
//         }
//       },
//       checkedGroup(id) {
//         const item = this.items.filter(i => i.id === id)[0];
//         if (this.isSee) {
//           this.seeUser = item;
//         } else {
//           this.sendUser = item;
//         }
//         this.checkedId = this.isSee ? this.seeUser.id : this.sendUser.id;
//       },
//       togglePopup(isSee) {
//         this.isSee = isSee;
//         this.checkedId = isSee ? this.seeUser.id : this.sendUser.id;
//         this.customerPopupOpened = true;
//       },
  },
  data() {
    return {
      addonConfig,
      hasActorId: API.actorId,
      permissions: [],

      settings: {
        miniProgram: {
          isLocked: false,
          miniProgram: '',
        },
      },

      //copied from broadcast.
      // lists: null,
      // customerPopupOpened: false,
      // items: null,
      // seeUser: {
      //   id: null,
      //   name: null,
      // },
      // sendUser: {
      //   id: null,
      //   name: null,
      // },
      // isSee: null,
      // checkedId: null,
    };
  }
};
</script>
