<template>
  <f7-page name="tasks__list-management" id="tasks__list-management" class="tasks-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('tasks.list-management.title', 'List Management')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-list v-if="lists" sortable sortableEnabled inset class="list-custom" @sortable:sort="onSort">
      <f7-list-item
        v-for="list in orderedLists"
        checkbox
        :checked="list.data.active"
        :key="list.id"
        :title="list.name"
        @change="toggleListActive(list, $event.target.checked)"
      ></f7-list-item>
    </f7-list>

    <f7-list class="list-custom margin-bottom" inset>
      <f7-list-item
        link="/tasks/list-add/"
        title="Create New List"
      ></f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        saving: false,
        showSave: false,
        lists: null,
      };
    },
    mounted() {
      const self = this;
      API.loadLists({}, { cache: false }).then((lists) => {
        self.lists = lists;
      });
    },
    computed: {
      orderedLists() {
        const self = this;
        if (!self.lists) return null;
        return self.lists.sort((a, b) => {
          return a.data.position - b.data.position;
        });
      },
    },
    methods: {
      onSort(e, { from, to } = {}) {
        const self = this;
        if (self.saving) return;
        self.showSave = true;
        self.$nextTick(() => {
          self.lists[from].data.position = to;
          self.lists.splice(to, 0, ...self.lists.splice(from, 1));
          self.$forceUpdate();
        });
      },
      toggleListActive(list, active) {
        const self = this;
        if (self.saving) return;
        self.showSave = true;
        list.data.active = active;
      },
      save() {
        const self = this;
        self.showSave = false;
        const promises = [];
        self.lists.forEach((list, index) => {
          list.data.position = index;
          promises.push(API.saveList(list));
        });
        Promise.all(promises).then(() => {
          self.$events.$emit('tasks:reloadLists');
          self.$f7router.back();
        });
      },
    },
  };
</script>