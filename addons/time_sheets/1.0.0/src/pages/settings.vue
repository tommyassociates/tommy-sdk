<template>
  <f7-page class="time-clock-settings-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('time_sheets.settings.title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-only class="back">
          <f7-icon f7="check"/>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-page-content ref="pageContent">

      <f7-list style="margin-bottom:0">
        <f7-list-item :title="$t('time_sheets.settings.time_period_label')">
          <time-period-select
            v-model="settings.time_period"
            @change="onTimePeriodChange"
            @save="onTimePeriodSave">
          </time-period-select>
        </f7-list-item>
        <f7-list-item :title="$t('time_sheets.settings.week_start_label')">
          <day-select
            v-model="settings.week_start"
            @change="onWeekStartChange"
            @save="onWeekStartSave">
          </day-select>
        </f7-list-item>
      </f7-list>

      <f7-block-title class="time-clock-divider">{{$t('time_sheets.settings.who_can_view_timesheets_title')}}
      </f7-block-title>
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


      <f7-block-title class="time-clock-divider">{{$t('time_sheets.settings.who_can_manage_items_title')}}
      </f7-block-title>
<!--      <f7-list class="message-list">-->
<!--        <f7-list-item >-->
<!--          <search-cmp @clickOpened="togglePopup(true)"></search-cmp>-->
<!--        </f7-list-item>-->
<!--        <f7-list-item >-->
<!--          <tag-cmp-->
<!--            :name="seeUser.name"-->
<!--            @clearName="clearUser(true)"-->
<!--          ></tag-cmp>-->
<!--        </f7-list-item>-->
<!--      </f7-list>-->

      <f7-block-title class="time-clock-divider">{{$t('time_sheets.settings.who_can_manage_timesheets_title')}}
      </f7-block-title>
<!--      <f7-list class="message-list">-->
<!--        <f7-list-item >-->
<!--          <search-cmp @clickOpened="togglePopup(true)"></search-cmp>-->
<!--        </f7-list-item>-->
<!--        <f7-list-item >-->
<!--          <tag-cmp-->
<!--            :name="seeUser.name"-->
<!--            @clearName="clearUser(true)"-->
<!--          ></tag-cmp>-->
<!--        </f7-list-item>-->
<!--      </f7-list>-->

      <permission-select title="test" addonPackage="time_sheets"></permission-select>



    </f7-page-content>

    <!-- Popup -->
        <group-popup-cmp
          :opened="customerPopupOpened"
          @closed="customerPopupOpened = false"
          :items="items"
          @checkedGroup="checkedGroup"
          :checkedId="checkedId"
        ></group-popup-cmp>


  </f7-page>
</template>

<script>
  import API from '../api';
  import GroupPopupCmp from '../components/group-popup.vue';
  import SearchCmp from '../components/search.vue';
  import TagCmp from '../components/tag.vue';

  import timePeriodSelect from 'tommy_core/src/components/time-period-select.vue';
  import daySelect from 'tommy_core/src/components/day-select.vue';

  import permissionSelect from 'tommy_core/src/components/permission-select.vue';

  // import tagSelect from '../components/tag-select.vue';

  export default {
    name: "TimeSheetSettings",
    components: {
      GroupPopupCmp,
      SearchCmp,
      TagCmp,
      timePeriodSelect,
      daySelect,
      permissionSelect,
    },
    mounted() {
      const self = this;
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

      // self.$api.getInstalledAddonSetting('time_sheets', 'time_sheets').then(response => {
      //   const self=this;
      //   self.settings.day = response !== null && response.data && response.data.day ? response.data.day : 'mon';
      //   self.settings.timePeriod = response !== null && response.data && response.data.timePeriod ? response.data.timePeriod : 'week';
      // });

      API.getWorkforceSettings().then(settings => {
        const self=this;
        self.settings = settings;
      });

      self.items = [
        {
          id: 1215,
          name: 'elder',
        },
        {
          id: 155,
          name: 'manager',
        },
      ];

    },
    methods: {

      onTimePeriodChange(value) {
        const self = this;
        console.log('search - date range change: ' + value);
      },

      onTimePeriodSave(value) {
        const self = this;
        console.log('search - date range save: ' + value);
        self.settings.time_period = value;
        API.updateWorkforceSettings(self.settings);
      },

      onWeekStartChange(value) {
        const self = this;
        console.log('search - dat change: ' + value);
      },

      onWeekStartSave(value) {
        const self = this;
        console.log('search - dat save: ' + value);
        self.settings.week_start = value;
        API.updateWorkforceSettings(self.settings);
      },


      saveListPermission(permission) {
        const self = this;
        tommy.api.updateInstalledAddonPermission('wallet_accounts', permission.name, {
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


//copied from broadcast.
      clearUser(isSee) {
        const user = {
          id: null,
          name: null,
        };
        if (isSee) {
          this.seeUser = user;
        } else {
          this.sendUser = user;
        }
      },
      checkedGroup(id) {
        const item = this.items.filter(i => i.id === id)[0];
        if (this.isSee) {
          this.seeUser = item;
        } else {
          this.sendUser = item;
        }
        this.checkedId = this.isSee ? this.seeUser.id : this.sendUser.id;
      },
      togglePopup(isSee) {
        this.isSee = isSee;
        this.checkedId = isSee ? this.seeUser.id : this.sendUser.id;
        this.customerPopupOpened = true;
      },
    },
    data() {
      return {
        hasActorId: API.actorId,
        permissions: [],

        settings: {
          time_period: 'weekly',
          week_start: 'monday',
        },

        //copied from broadcast.
        lists: null,
        customerPopupOpened: false,
        items: null,
        seeUser: {
          id: null,
          name: null,
        },
        sendUser: {
          id: null,
          name: null,
        },
        isSee: null,
        checkedId: null,
      };
    }
  };
</script>
