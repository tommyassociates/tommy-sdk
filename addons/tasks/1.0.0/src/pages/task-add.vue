<template>
  <f7-page id="tasks__task-add" name="tasks__task-add" class="tasks-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('tasks.task-add.title', 'Add Task')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="name && name.trim().length && !saving" icon-f7="check" @click="save"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list>
      <f7-list-item>
        <f7-input type="text" :value="name" @input="name = $event.target.value" :placeholder="$t('tasks.task-add.name', 'Name')"></f7-input>
      </f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';
  import taskStatuses from '../utils/task-statuses';


  export default {
    data() {
      return {
        name: '',
        saving: false,
      };
    },
    methods: {
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        const user = self.$root.user;

        const data = {
          name: self.name,
          status: taskStatuses[0],
          filters: [{
            context: 'members',
            name: `${user.first_name} ${user.last_name}`,
            user_id: user.id,
          }],
          data: {
            activity: [{
              type: 'status',
              text: self.$t('tasks.task.created_a_task'),
              time: new Date(),
              user_id: user.id,
              user_name: user.first_name,
            }],
          },
        };
        API.saveTask(data).then(() => {
          self.$events.$emit('tasks:reloadListsTasks');
          self.$f7router.back();
        });
      },
    },
  };
</script>

