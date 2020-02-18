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
      <f7-list-item
        smart-select
        :smart-select-params="{closeOnSelect: true}"
        :title="$t('invoicing.list_edit.sort', 'Sort')"
      >
        <select name="sort" class="toggle-save" @change="onSortChange">
          <option
            v-for="(sorting, index) in ['default', 'price_high', 'price_low', 'newest']"
            :key="index"
            :value="sorting"
            :selected="list.data.sort === sorting || (sorting === 'default' && !list.data.sort)"
          >{{$t(`invoicing.list_edit.sort_${sorting}`)}}</option>
        </select>
      </f7-list-item>

      <f7-list-item
        link="#"
        @click="showDateRange"
        :title="$t('invoicing.common.date_range', 'Date Range')"
        :after="formatDateRange(list.data.date_range)"
      ></f7-list-item>

      <f7-list-item
        smart-select
        :smart-select-params="{openIn: 'popover', closeOnSelect: true}"
        :title="$t('invoicing.list_edit.filter_status', 'Status')"
      >
        <select name="statuses" class="toggle-save" multiple @change="onStatusChange">
          <option
            v-for="(status, index) in orderStatuses"
            :key="index"
            :value="status"
            :selected="list.data.status.indexOf(status) >= 0 || !list.data.status"
          >{{$t(`invoicing.order_status.${status}`)}}</option>
        </select>
      </f7-list-item>

      <!-- Type -->
      <f7-list-item smart-select :smart-select-params="{openIn: 'popover', closeOnSelect: true}" :title="$t('invoicing.list_edit.type')">
        <select name="type" @change="onTypeChange">
          <option :selected="list.data.type === 'all' || !list.data.type" value="all">{{$t('invoicing.list_edit.type_all')}}</option>
          <option :selected="list.data.type === 'invoice'" value="invoice">{{$t('invoicing.list_edit.type_invoice')}}</option>
          <option :selected="list.data.type === 'quote'" value="quote">{{$t('invoicing.list_edit.type_quote')}}</option>
        </select>
      </f7-list-item>

      <!-- Balance Range -->
      <!-- <f7-list-item
        link
        :title="$t('invoicing.list_edit.balance_range')"
        @click="showBalanceRange"
        :after="typeof list.data.balance_min !== 'undefined' && typeof list.data.balance_max !== 'undefined' ? `${list.data.balance_min} - ${list.data.balance_max}` : ''"
      ></f7-list-item> -->

      <!-- Payment Range -->
      <f7-list-item
        link
        :title="$t('invoicing.list_edit.payment_range')"
        @click="showPaymentRange"
        :after="typeof list.data.price_min !== 'undefined' && typeof list.data.price_max !== 'undefined' ? `${list.data.price_min} - ${list.data.price_max}` : ''"
      ></f7-list-item>

      <!-- Specific Items -->
      <!-- Auto Renew -->

      <!-- Assignee -->
      <f7-list-item smart-select :smart-select-params="{searchbar: true}" v-if="$root.team && $root.teamMembers && !list.data.only_assigned" :title="$t('invoicing.list_edit.assignee', 'Assignee')">
        <select name="assignee" multiple @change="onAssigneeChange">
          <option
            v-for="(teamMember) in $root.teamMembers"
            :key="teamMember.id"
            :value="teamMember.user_id"
            data-option-class="invoicing-smart-select-option"
            :data-option-image="teamMember.icon_url"
            :selected="list.data.assignee.indexOf(teamMember.user_id) >= 0"
          >{{teamMember.first_name || ''}} {{teamMember.last_name || ''}}</option>
        </select>
      </f7-list-item>

      <!-- Customer -->
      <f7-list-item  smart-select :smart-select-params="{searchbar: true}" v-if="contacts" :title="$t('invoicing.list_edit.customer', 'Customer')">
        <select name="customer" multiple @change="onCustomerChange">
          <option
            v-for="(contact, contactIndex) in contacts"
            :key="`${contactIndex}-${contact.id}-${contact.friend_id}`"
            :value="contact.friend_id"
            data-option-class="invoicing-smart-select-option"
            :data-option-image="contact.icon_url"
            :selected="list.data.customer.indexOf(contact.friend_id) >= 0"
          >{{contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`}}</option>
        </select>
      </f7-list-item>

      <!-- Only assigned -->
      <f7-list-item
        :title="$t('invoicing.list_edit.only_assigned', 'Show only assigned')"
      >
        <f7-toggle
          slot="after"
          :checked="!!list.data.only_assigned"
          @change="setOnlyAssigned($event.target.checked)"
        />
      </f7-list-item>

      <!-- Show canceled -->
      <f7-list-item
        :title="$t('invoicing.list_edit.include_canceled', 'Include cancelled orders')"
      >
        <f7-toggle
          slot="after"
          :checked="!!list.data.canceled"
          @change="setCanceled($event.target.checked)"
        />
      </f7-list-item>


      <tag-select
        v-for="(permission, index) in permissions"
        :key="index"
        :listId="list.id"
        :data="{
          title: $t(`invoicing.permissions.${permission.name}.title`),
          placeholder: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          pageTitle: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          tags: permission.filters,
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
  import formatDateRange from 'tommy_core/src/utils/format-date-range';
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
        contacts: API.contacts,
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
        if (!list.data.status) list.data.status = [];
        if (!list.data.customer) list.data.customer = [];
        if (!list.data.assignee) list.data.assignee = [];
        if (typeof list.data.canceled === 'undefined') list.data.canceled = true;
        self.list = list;
        self.$api.getInstalledAddonPermission('invoicing', 'order_list_read_access', {
          taggable_id: list.id,
          with_filters: true,
        }).then((permission) => {
          permission.taggable_id = list.id;
          self.permissions.push(permission);
        });
        self.$api.getInstalledAddonPermission('invoicing', 'order_list_edit_access', {
          taggable_id: list.id,
          with_filters: true,
        }).then((permission) => {
          permission.taggable_id = list.id;
          self.permissions.push(permission);
        });
        if (!API.contacts) {
          self.$api.getContacts().then((c) => {
            self.contacts = c;
            API.contacts = c;
          });
        }
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
      onSortChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.sort = self.$$(e.target).val();
        self.showSave = true;
      },
      onStatusChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.status = self.$$(e.target).val();
        self.showSave = true;
      },
      onTypeChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.type = e.target.value;
        self.showSave = true;
      },
      onCustomerChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.customer = self.$$(e.target).val().map(el => parseInt(el, 10));
        self.showSave = true;
      },
      onAssigneeChange(e) {
        const self = this;
        if (self.saving) return;
        self.list.data.assignee = self.$$(e.target).val().map(el => parseInt(el, 10));
        self.showSave = true;
      },
      setOnlyAssigned(checked) {
        const self = this;
        self.list.data.only_assigned = checked;
        self.showSave = true;
        if (checked) {
          self.list.data.assignee = [];
        }
      },
      setCanceled(checked) {
        const self = this;
        self.list.data.canceled = checked;
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
      showBalanceRange() {
        const self = this;
        const { balance_min, balance_max } = self.list.data;
        self.$f7router.navigate('/invoicing/range-select/', {
          props: {
            pageTitle: self.$t('invoicing.list_edit.balance_range'),
            from: balance_min ? parseFloat(balance_min) : balance_min,
            to: balance_max ? parseFloat(balance_max) : balance_max,
            onSave({ from, to }) {
              self.list.data.balance_min = from;
              self.list.data.balance_max = to;
              self.list = self.list;
              API.saveList(self.list).then(() => {
                self.$f7router.back();
              });
            },
          },
        });
      },
      showPaymentRange() {
        const self = this;
        const { price_min, price_max } = self.list.data;
        self.$f7router.navigate('/invoicing/range-select/', {
          props: {
            pageTitle: self.$t('invoicing.list_edit.payment_range'),
            from: price_min ? parseFloat(price_min) : price_min,
            to: price_max ? parseFloat(price_max) : price_max,
            onSave({ from, to }) {
              self.list.data.price_min = from;
              self.list.data.price_max = to;
              self.list = self.list;
              API.saveList(self.list).then(() => {
                self.$f7router.back();
              });
            },
          },
        });
      },
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        self.showSave = false;
        API.saveList(self.list).then(() => {
          self.$events.$emit('invoicing:reloadLists', self.listId);
          self.$f7router.back();
        });
      },
      deleteList() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        self.showSave = false;
        API.deleteList(self.list.id, self.list).then(() => {
          self.$events.$emit('invoicing:reloadLists', self.listId);
          self.$f7router.back();
        });
      },
      saveListPermission(permission) {
        const self = this;
        self.$api.updateInstalledAddonPermission('invoicing', permission.name, {
          taggable_id: permission.taggable_id,
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
