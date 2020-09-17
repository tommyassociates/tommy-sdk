<template>
  <f7-page class="time-clock-settings-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{ $t('time_clock.settings.title') }}</f7-nav-title>
      <f7-nav-right>
        <!--        <f7-link icon-only class="back">-->
        <!--          <f7-icon f7="check" />-->
        <!--        </f7-link>-->
      </f7-nav-right>
    </f7-navbar>

    <f7-page-content ref="pageContent">
      <template v-if="canLockMiniProgram">
        <f7-block-title class="time-clock-divider">{{ $t('time_clock.settings.lock_mini_program_title') }}
        </f7-block-title>
        <f7-list>
          <f7-list-item>
            <span>{{ $t('time_clock.settings.lock_mini_program_toggle') }}</span>
            <f7-toggle :checked="$root.miniProgramLocked.isLocked"
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
import API from '../api';
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
    ...mapGetters('account', ['canLockMiniProgram']),
  },
  mounted() {
    const self = this;
    self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_create_access', {
      resource_id: undefined,
      with_filters: true,
    }).then((permission) => {
      permission.resource_id = undefined;
      self.permissions.push(permission);
    });
    self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_edit_access', {
      resource_id: undefined,
      with_filters: true,
    }).then((permission) => {
      permission.resource_id = undefined;
      self.permissions.push(permission);
    });

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
    saveListPermission(permission) {
      const self = this;
      self.$api.updateInstalledAddonPermission('wallet_accounts', permission.name, {
        resource_id: permission.resource_id,
        with_filters: true,
        filters: JSON.stringify(permission.filters),
      });
    },
    addListPermission(permission, tag) {
      const self = this;
      permission.filters.push(tag);
      self.saveListPermission(permission);
    },
    removeListPermission(permission, tag) {
      const self = this;
      permission.filters.splice(permission.filters.indexOf(tag), 1);
      self.saveListPermission(permission);
    },

    toggleIsMiniProgramLocked(isLocked) {
      const self = this;
      const name = 'time_clock';
      const uuid = window.device && window.device.uuid ? window.device.uuid : '';



      const payload = {
        name,
        uuid,
        locked: isLocked,
        platform: String(window.device.platform).toLowerCase(),

      };

      self.$api.updateDevice(payload).then(() => {
        self.$root.miniProgramLocked.isLocked = isLocked;
        if (isLocked) {
          self.$root.miniProgramLocked.miniProgram = name;
        }
        localStorage.miniProgramLocked = JSON.stringify(self.$root.miniProgramLocked);
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
      hasActorId: API.actorId,
      permissions: [],

      attendanceData: [],
      csvHeaders: [],

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


