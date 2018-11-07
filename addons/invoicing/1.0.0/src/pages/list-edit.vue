<template>
  <f7-page name="invoicing__list-edit" id="invoicing__list-edit" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.list_edit.title', 'Edit List')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list v-if="list" class="list-custom">
      <f7-list-item>
        <f7-label>{{$t('invoicing.list_edit.name', 'Name')}}</f7-label>
        <f7-input type="text" :value="list.name" @input="onNameChange($event.target.value)"></f7-input>
      </f7-list-item>

      <!-- Sort -->
      <!-- ... -->

      <f7-list-item
        link="#"
        @click="showDateRange"
        :title="$t('invoicing.common.date_range', 'Date Range')"
        :after="formatDateRange(list.data.date_range)"
      ></f7-list-item>

      <f7-list-item
        smart-select
        :title="$t('invoicing.list_edit.filter_status', 'Status')"
      >
        <select name="statuses" class="toggle-save" multiple @change="onStatusChange">
          <option
            v-for="(status, index) in orderStatuses"
            :key="index"
            :value="status"
            :selected="list.data.statuses.indexOf(status) >= 0"
          >{{$t(`invoicing.status.${status.toLowerCase().replace(/ /g, '_')}`)}}</option>
        </select>
      </f7-list-item>

      <!-- Type -->
      <!-- Balance Range -->
      <!-- Payment Range -->
      <!-- Specific Items -->
      <!-- Auto Renew -->

      <!-- Activity From -->
      <f7-list-item smart-select :smart-select-params="{searchbar: true}" v-if="$root.team && $root.teamMembers" :title="$t('invoicing.list_edit.activity_from', 'Activity From')">
        <select name="activity_from" multiple @change="onActivityFromChange">
          <option
            v-for="(teamMember) in $root.teamMembers"
            :key="teamMember.id"
            :value="teamMember.user_id"
            data-option-class="invoicing-smart-select-option"
            :data-option-image="teamMember.icon_url"
            :selected="list.data.activity_from.indexOf(teamMember.user_id) >= 0"
          >{{teamMember.first_name || ''}} {{teamMember.last_name || ''}}</option>
        </select>
      </f7-list-item>

      <!-- Customer -->
      <f7-list-item smart-select :smart-select-params="{searchbar: true}" v-if="$root.team && $root.teamMembers" :title="$t('invoicing.list_edit.customer', 'Customer')">
        <select name="customer" multiple @change="onCustomerChange">
          <option
            v-for="(teamMember) in $root.teamMembers"
            :key="teamMember.id"
            :value="teamMember.user_id"
            data-option-class="invoicing-smart-select-option"
            :data-option-image="teamMember.icon_url"
            :selected="list.data.customer.indexOf(teamMember.user_id) >= 0"
          >{{teamMember.first_name || ''}} {{teamMember.last_name || ''}}</option>
        </select>
      </f7-list-item>

      <!-- Bill To -->
      <f7-list-item smart-select :smart-select-params="{searchbar: true}" v-if="$root.team && $root.teamMembers" :title="$t('invoicing.list_edit.bill_to', 'Bill To')">
        <select name="bill_to" multiple @change="onBillToChange">
          <option
            v-for="(teamMember) in $root.teamMembers"
            :key="teamMember.id"
            :value="teamMember.user_id"
            data-option-class="invoicing-smart-select-option"
            :data-option-image="teamMember.icon_url"
            :selected="list.data.bill_to.indexOf(teamMember.user_id) >= 0"
          >{{teamMember.first_name || ''}} {{teamMember.last_name || ''}}</option>
        </select>
      </f7-list-item>

      <tag-select
        v-for="(permission, index) in permissions"
        :key="index"
        :listId="list.id"
        :data="{
          title: $t(`invoicing.permissions.${permission.name}.title`),
          placeholder: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          pageTitle: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          filters: permission.filters,
        }"
        @tagAdd="(tag) => addListPermission(permission, tag)"
        @tagRemove="(tag) => removeListPermission(permission, tag)"
      ></tag-select>
    </f7-list>

    <f7-list v-if="list" class="margin-top">
      <f7-list-button color="custom" class="color-custom" @click="deleteList">{{$t('invoicing.list_edit.delete-list', 'Delete List')}}</f7-list-button>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';
  import orderStatuses from '../utils/order-statuses';
  import formatDateRange from '../utils/format-date-range';
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
        orderStatuses,
        list: null,
        permissions: [],
      };
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off('invoicing:setListDateRange', self.updateListDateRange);
    },
    mounted() {
      const self = this;
      API.loadList(self.id).then((list) => {
        if (!list.data) list.data = {};
        if (!list.data.statuses) list.data.statuses = [];
        if (!list.data.activity_from) list.data.activity_from = [];
        if (!list.data.customer) list.data.customer = [];
        if (!list.data.bill_to) list.data.bill_to = [];
        self.list = list;
        self.$api.getInstalledAddonPermission('invoicing', 'invoicing_order_list_read_access', {
          resource_id: list.id,
          with_filters: true,
        }).then((permission) => {
          permission.resource_id = list.id;
          self.permissions.push(permission);
        });
        self.$api.getInstalledAddonPermission('invoicing', 'invoicing_order_list_edit_access', {
          resource_id: list.id,
          with_filters: true,
        }).then((permission) => {
          permission.resource_id = list.id;
          self.permissions.push(permission);
        });
      });
      self.$events.$on('invoicing:setListDateRange', self.updateListDateRange);
    },
    methods: {
      formatDateRange,
      updateListDateRange(listId, range) {
        const self = this;
        if (self.list.id !== listId) return;
        self.list.data.date_range = range;
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
      onActivityFromChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.activity_from = self.$$(e.target).val().map(el => parseInt(el, 10));
        self.showSave = true;
      },
      onCustomerChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.customer = self.$$(e.target).val().map(el => parseInt(el, 10));
        self.showSave = true;
      },
      onBillToChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.bill_to = self.$$(e.target).val().map(el => parseInt(el, 10));
        self.showSave = true;
      },
      showDateRange() {
        const self = this;
        self.$f7router.navigate('/invoicing/list-edit/date-range/', {
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
          self.$events.$emit('invoicing:reloadLists');
          self.$f7router.back();
        });
      },
      deleteList() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        self.showSave = false;
        API.deleteList(self.list.id).then(() => {
          self.$events.$emit('invoicing:reloadLists');
          self.$f7router.back();
        });
      },
      saveListPermission(permission) {
        const self = this;
        self.$api.updateInstalledAddonPermission('invoicing', permission.name, {
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