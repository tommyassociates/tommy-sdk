<template>
  <f7-page name="tasks__list-edit" id="tasks__list-edit" class="tasks__page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('tasks.list-edit.title', 'Edit List')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list v-if="list" class="list-custom">
      <f7-list-item>
        <f7-label>{{$t('tasks.list-edit.name', 'Name')}}</f7-label>
        <f7-input type="text" :value="list.name" @input="onNameChange($event.target.value)"></f7-input>
      </f7-list-item>

      <f7-list-item
        :title="$t('tasks.list-edit.show-fast-add-task', 'Show Fast Add Task')"
      >
        <f7-toggle slot="after" :checked="list.data.show_fast_add" @change="toggleFastAdd($event.target.checked)"></f7-toggle>
      </f7-list-item>

      <f7-list-item
        smart-select
        :title="$t('tasks.list-edit.filter-status', 'Filter Status')"
      >
        <select name="statuses" class="toggle-save" multiple @change="onStatusChange">
          <option
            v-for="(status, index) in taskStatuses"
            :key="index"
            :value="status"
            :selected="list.data.statuses.indexOf(status) >= 0"
          >{{$t(`tasks.status.${status.toLowerCase().replace(/ /g, '_')}`)}}</option>
        </select>
      </f7-list-item>
      <f7-list-item
        link="#"
        @click="showDateRange"
        :title="$t('tasks.common.date_range', 'Date Range')"
        :after="formatDateRange(list.data.date_range)"
      ></f7-list-item>

      <tag-select
        v-for="(permission, index) in permissions"
        :key="index"
        :listId="list.id"
        :data="permission"
        :f7router="f7router"
        @tagAdd="(tag) => addListPermission(permission, tag)"
        @tagRemove="(tag) => removeListPermission(permission, tag)"
      ></tag-select>
      <tag-select
        :listId="list.id"
        :data="{
          title: $t('tasks.permissions.filter_tasks.title'),
          name: 'filter_tasks',
          filters: list.filters,
        }"
        :f7router="f7router"
        @tagAdd="addListFilter"
        @tagRemove="removeListFilter"
      ></tag-select>
    </f7-list>

    <f7-list v-if="list && !list.data.default" class="margin-top">
      <f7-list-button color="custom" class="color-custom" @click="deleteList">{{$t('tasks.list-edit.delete-list', 'Delete List')}}</f7-list-button>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';
  import taskStatuses from '../utils/task-statuses';
  import formatDateRange from 'tommy-core/src/utils/format-date-range';
  import tagSelect from '../components/tag-select.vue';

  export default {
    components: {
      tagSelect,
      f7router: Object
    },
    props: {
      listId: [String, Number],
    },
    data() {
      return {
        showSave: false,
        id: parseInt(this.listId, 10),
        taskStatuses,
        list: null,
        permissions: [],
      };
    },
    beforeUnmount() {
      const self = this;
      self.$events.$off('tasks:setListDateRange', self.updateListDateRange);
    },
    mounted() {
      const self = this;
      API.loadList(self.id).then((list) => {
        if (!list.data) list.data = {};
        if (!list.data.statuses) list.data.statuses = [];
        self.list = list;
        self.$api.getInstalledAddonPermission('tasks', 'task_list_read_access', {
          taggable_id: list.id,
          with_filters: true,
        }).then((permission) => {
          permission.taggable_id = list.id;
          self.permissions.push(permission);
        });
        self.$api.getInstalledAddonPermission('tasks', 'task_list_edit_access', {
          taggable_id: list.id,
          with_filters: true,
        }).then((permission) => {
          permission.taggable_id = list.id;
          self.permissions.push(permission);
        });
      });
      self.$events.$on('tasks:setListDateRange', self.updateListDateRange);
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
      toggleFastAdd(enabled) {
        const self = this;
        if (self.saving) return;
        self.list.data.show_fast_add = enabled;
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
        self.f7router.navigate(`/tasks/list-edit/${self.list.id}/date-range/`, {
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
          self.$events.$emit('tasks:reloadLists');
          self.f7router.back();
        });
      },
      deleteList() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        self.showSave = false;
        API.deleteList(self.list.id).then(() => {
          self.$events.$emit('tasks:reloadLists');
          self.f7router.back();
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
        self.$api.updateInstalledAddonPermission('tasks', permission.name, {
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
