<template>
  <f7-page name="wallet_accounts__list-edit" id="wallet_accounts__list-edit" class="wallet_accounts__page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('wallet_accounts.list-edit.title', 'Edit List')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list v-if="list" class="list-custom">
      <f7-list-item>
        <f7-label>{{$t('wallet_accounts.list-edit.name', 'Name')}}</f7-label>
        <f7-input type="text" :value="list.name" @input="onNameChange($event.target.value)"></f7-input>
      </f7-list-item>

      <f7-list-item
        smart-select
        :title="$t('wallet_accounts.list-edit.filter-status', 'Filter Status')"
      >
        <select name="statuses" multiple @change="onStatusChange">
          <option
            v-for="(status, index) in statuses"
            :key="index"
            :value="status"
            :selected="list.data.statuses.indexOf(status) >= 0"
          >{{$t(`wallet_accounts.transaction_status.${status.toLowerCase().replace(/ /g, '_')}`)}}</option>
        </select>
      </f7-list-item>
      <f7-list-item
        link="#"
        @click="showAmountSelect"
        :title="$t('wallet_accounts.list-edit.filter-amount', 'Transaction Amount')"
      >
        <span v-html="formatAmountRange(list.data.amount_min, list.data.amount_max)" slot="after"></span>
      </f7-list-item>
      <f7-list-item
        link="#"
        @click="showDateRange"
        :title="$t('wallet_accounts.common.date_range', 'Date Range')"
        :after="formatDateRange(list.data.date_range)"
      ></f7-list-item>

      <tag-select
        v-for="(permission, index) in permissions"
        :key="index"
        :listId="list.id"
        :data="permission"
        @tagAdd="(tag) => addListPermission(permission, tag)"
        @tagRemove="(tag) => removeListPermission(permission, tag)"
      ></tag-select>
      <tag-select
        :listId="list.id"
        :data="{
          title: $t('wallet_accounts.permissions.filter_transactions.title'),
          name: 'filter_transactions',
          filters: list.filters,
        }"
        @tagAdd="addListFilter"
        @tagRemove="removeListFilter"
      ></tag-select>
    </f7-list>

    <f7-list v-if="list && !list.data.default" class="margin-top">
      <f7-list-button color="custom" class="color-custom" @click="deleteList">{{$t('wallet_accounts.list-edit.delete-list', 'Delete List')}}</f7-list-button>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';
  import formatDateRange from 'tommy-core/src/utils/format-date-range';
  import formatAmountRange from '../utils/format-amount-range';
  import tagSelect from '../components/tag-select.vue';

  export default {
    components: {
      tagSelect,
    },
    props: {
      listId: [String, Number],
    },
    data() {
      return {
        showSave: false,
        id: parseInt(this.listId, 10),
        list: null,
        permissions: [],
        statuses: ['failed', 'paid'],
      };
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off('wallet_accounts:setListDateRange', self.updateListDateRange);
      self.$events.$off('wallet_accounts:setListAmount', self.updateListAmount);
    },
    mounted() {
      const self = this;
      API.loadList(self.id).then((list) => {
        if (!list.data) list.data = {};
        if (!list.data.statuses) list.data.statuses = [];
        self.list = list;
        self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_list_read_access', {
          resource_id: list.id,
          with_filters: true,
        }).then((permission) => {
          permission.resource_id = list.id;
          self.permissions.push(permission);
        });
        self.$api.getInstalledAddonPermission('wallet_accounts', 'wallet_accounts_transaction_list_edit_access', {
          resource_id: list.id,
          with_filters: true,
        }).then((permission) => {
          permission.resource_id = list.id;
          self.permissions.push(permission);
        });
      });
      self.$events.$on('wallet_accounts:setListDateRange', self.updateListDateRange);
      self.$events.$on('wallet_accounts:setListAmount', self.updateListAmount);
    },
    methods: {
      formatDateRange,
      formatAmountRange,
      updateListDateRange(listId, range) {
        const self = this;
        if (self.list.id !== listId) return;
        self.list.data.date_range = range;
      },
      updateListAmount(listId, min, max) {
        const self = this;
        if (self.list.id !== listId) return;
        self.list.data.amount_min = min;
        self.list.data.amount_max = max;
        self.$forceUpdate();
      },
      onNameChange(name) {
        const self = this;
        if (self.saving) return;
        self.list.name = name;
        self.showSave = true;
      },
      onStatusChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.statuses = self.$$(e.target).val();
        self.showSave = true;
      },
      showDateRange() {
        const self = this;
        self.$f7router.navigate(`/wallet_accounts/list-edit/${self.list.id}/date-range/`, {
          props: {
            list: self.list,
          },
        });
      },
      showAmountSelect() {
        const self = this;
        self.$f7router.navigate(`/wallet_accounts/list-edit/${self.list.id}/amount-select/`, {
          props: {
            list: self.list,
          },
        });
      },
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        self.showSave = false;
        API.saveList(self.list).then(() => {
          self.$events.$emit('wallet_accounts:reloadLists');
          self.$f7router.back();
        });
      },
      deleteList() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        self.showSave = false;
        API.deleteList(self.list.id).then(() => {
          self.$events.$emit('wallet_accounts:reloadLists');
          self.$f7router.back();
        });
      },
      addListFilter(tag) {
        const self = this;
        if (self.saving) return;
        self.showSave = true;
        self.list.filters.push(tag);
      },
      removeListFilter(tag) {
        const self = this;
        if (self.saving) return;
        self.showSave = true;
        self.list.filters.splice(self.list.filters.indexOf(tag), 1);
      },
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
    },
  };
</script>