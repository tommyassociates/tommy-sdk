<template>
  <f7-page id="tasks__index" name="tasks__index" class="tasks-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="/tasks/list-management/" icon-f7="gear"></f7-link>
        <f7-link href="/tasks/task-add/" icon-f7="add"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-swiper v-if="orderedLists && orderedLists.length" :params="{
      slidesPerView: 'auto',
      breakpointsInverse: true,
      centeredSlides: false,
      touchMoveStopPropagation: false,
      on: {
        tap: onSlideClick
      },
      breakpoints: {
        768: {
          centeredSlides: true,
        }
      },
    }">
      <f7-swiper-slide
        v-for="list in orderedLists"
        :key="list.id"
      >
        <div class="tasks-list" :data-id="list.id" :class="{'hasScroll': listWithScroll[list.id]}">
          <div class="tasks-list-header">
            <div>{{list.name}}</div>
            <div v-if="canEditList(list)">
              <a :data-url="`/tasks/list-edit/${list.id}/`">
                <img
                  :src="`${$addonAssetsUrl}slice6.png`"
                  :srcset="`${$addonAssetsUrl}slice6@2x.png 2x, ${$addonAssetsUrl}slice6@3x.png 3x`"
                >
              </a>
            </div>
          </div>
          <div class="tasks-list-content">
            <template v-if="list.tasks && list.tasks.length">
              <a v-for="(task, index) in list.tasks" :key="index" :data-url="`/tasks/task/${task.id}/`" class="card task-card" :class="isTaskDone(task) ? 'color-gray done' : ''">
                <div class="card-content card-content-padding">
                  <p>{{task.name}}</p>
                </div>
                <div class="card-footer no-border color-gray">
                  <span v-if="task.end_at" class="badge" :class="isPastDate(task.end_at) ? 'bg-red' : 'bg-blue'">{{humanTime(task.end_at)}}</span>
                  <span v-else-if="task.data.checklist" class="icon">
                    <img
                      :src="`${$addonAssetsUrl}slice1.png`"
                      :srcset="`${$addonAssetsUrl}slice1@2x.png 2x,${$addonAssetsUrl}slice1@3x.png 3x`"
                    >
                    {{checklistNumCompleted(task.data.checklist)}}
                  </span>
                  <span v-else class="icon">
                    <img
                      :src="`${$addonAssetsUrl}slice2.png`"
                      :srcset="`${$addonAssetsUrl}slice2@2x.png 2x,${$addonAssetsUrl}slice2@3x.png 3x`"
                    >
                  </span>
                  <span>
                    {{task.status ? taskStatus(task.status) : $t('tasks.index.unassigned', 'Unassigned')}}
                  </span>
                </div>
              </a>
            </template>
          </div>
          <div class="tasks-list-footer" v-if="list.data.show_fast_add">
            <div class="in" v-if="!fastAddEnabled[list.id]">
              <div class="card-add" @click="$set(fastAddEnabled, list.id, true)">{{$t('tasks.index.add-task', 'Add task')}}</div>
            </div>
            <div class="in" v-else>
              <form class="card-form" @submit="fastAddTask($event, list)">
                <input autofocus type="text" :value="fastAddValue[list.id]" @input="fastAddValue[list.id] = $event.target.value">
                <div class="buttons">
                  <a href="#" class="button cancel" @click="$set(fastAddEnabled, list.id, false)">{{$t('tasks.index.cancel', 'Cancel')}}</a>
                  <button type="submit" class="button button-fill color-red save">{{$t('tasks.index.done', 'Done')}}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </f7-swiper-slide>
    </f7-swiper>
  </f7-page>
</template>
<script>
  import API from '../api';
  import humanTime from 'tommy-core/src/utils/human-time';
  import taskStatus from '../utils/task-status';

  export default {
    data() {
      const self = this;
      return {
        lists: null,
        actorId: self.$f7route.query.actor_id,
        fastAddEnabled: {},
        fastAddValue: {},
        listWithScroll: {},
      };
    },
    created() {
      const self = this;
      if (self.actorId) {
        API.actorId = parseInt(self.actorId, 10);
        API.actor = self.actor;
      } else {
        delete API.actorId;
        delete API.actor;
      }
    },
    computed: {
      actor() {
        const self = this;
        if (!self.actorId) return null;
        return self.$root.teamMembers.filter(user => user.user_id === parseInt(self.actorId, 10))[0];
      },
      pageTitle() {
        const self = this;
        if (!self.actorId) return self.$t('tasks.index.title', 'Tasks');
        const actorName = self.$root.teamMembers.filter(user => user.user_id === parseInt(self.actorId, 10))[0].first_name;
        return self.$t('tasks.index.title_user', { user: actorName });
      },
      orderedLists() {
        const self = this;
        if (!self.lists) return null;
        return self.lists.sort((a, b) => {
          return a.data.position - b.data.position;
        }).filter(list => list.data.active);
      },
    },
    methods: {
      onSlideClick(e) {
        const self = this;
        const url = self.$$(e.target).closest('a').eq(0).attr('data-url');
        if (!url) return;
        self.$f7router.navigate(url);
      },
      taskStatus,
      humanTime,
      listHasScroll(list) {
        const self = this;
        if (!list.tasks || list.tasks.length === 0) return false;
        const listContentEl = self.$$(`.tasks-list[data-id="${list.id}"] .tasks-list-content`)[0];
        if (!listContentEl) return false;
        return listContentEl.scrollHeight > listContentEl.offsetHeight;
      },
      loadListTasks(list) {
        const self = this;
        const user = self.actor || self.$root.user;
        API.loadListTasks(list, [`${user.first_name} ${user.last_name}`]).then((tasks) => {
          list.tasks = tasks;
          self.$nextTick(() => {
            if (self.listHasScroll(list)) {
              self.$set(self.listWithScroll, list.id, true);
            } else {
              self.$set(self.listWithScroll, list.id, false);
            }
          });
        });
      },
      reloadListsTasks() {
        const self = this;
        if (!self.lists) return;
        self.lists.forEach((list) => {
          self.loadListTasks(list);
        });
      },
      loadLists(ignoreCache) {
        const self = this;
        API.loadLists({}, { cache: !ignoreCache }).then((lists) => {
          lists.forEach((list) => {
            list.tasks = [];
          });
          self.lists = lists;
          const hasDefaultList = self.lists.filter(list => list.data.default).length > 0;
          if (hasDefaultList || self.actorId) {
            self.lists.forEach((list) => {
              if (!list.data.active) return;
              self.loadListTasks(list);
            });
          } else {
            API.createDefaultList(self.$root.user).then(() => {
              self.loadLists();
            });
          }
        });
      },
      reloadLists() {
        const self = this;
        self.loadLists(true);
      },
      fastAddTask(e, list) {
        const self = this;
        e.preventDefault();
        const name = self.fastAddValue[list.id];
        const data = {
          name,
          parent_id: list.id,
          filters: list.filters,
        };
        if (!name || !name.trim()) return false;

        self.fastAddValue[list.id] = '';
        self.fastAddEnabled[list.id] = false;

        API.saveTask(data).then(() => {
          self.loadListTasks(list);
        });
        return false;
      },
      isPastDate(date) {
        if (new Date(date) < new Date()) return true;
        return false;
      },
      checklistNumCompleted(checklist) {
        let ret = '';
        if (checklist && checklist.items) {
          const completed = checklist.items.filter(value => value.complete);
          ret += completed.length;
          ret += '/';
          ret += checklist.items.length;
        }
        return ret;
      },
      isTaskDone(task) {
        const statuses = 'Completed,Closed,Archive Task,Cancel'.split(',');
        if (statuses.indexOf(task.data.status) >= 0) return true;
        return false;
      },
      canEditList(list) {
        const self = this;
        const account = self.$root.account;
        const isOwnerOrManager = (account.type === 'Team') || (account.type === 'TeamMember');

        if (list.data.default && !isOwnerOrManager) return false;

        if (list.permission_to.indexOf('update') !== -1) return true;
        return false;
      },
      onSympleEvent(e) {
        const self = this;
        if (self.destroyed) return;
        if (!e || !e.name) return;
        if (e.name.indexOf('task_') === 0) {
          self.reloadListsTasks();
        }
      },
    },
    beforeDestroy() {
      const self = this;
      self.destroyed = true;
      self.$events.$off('tasks:reloadListsTasks', self.reloadListsTasks);
      self.$events.$off('tasks:reloadLists', self.reloadLists);
    },
    mounted() {
      const self = this;
      self.loadLists();
      self.$events.$on('tasks:reloadListsTasks', self.reloadListsTasks);
      self.$events.$on('tasks:reloadLists', self.reloadLists);
      self.$events.$emit('getChatClient', (client) => {
        client.on('event', self.onSympleEvent);
      });
    },
  };
</script>
