<template>
  <f7-page name="tasks__list-add" id="tasks__list-add" class="tasks__page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('tasks.list-add.title', 'Add List')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="top-0">
      <f7-list-item>
        <f7-input type="text" placeholder="Name" :value="name" @input="name = $event.target.value"></f7-input>
      </f7-list-item>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        saving: false,
        name: '',
      };
    },
    computed: {
      showSave() {
        return this.name.trim().length;
      },
    },
    methods: {
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;

        API
          .saveList({
            name: self.name,
          })
          .then(() => {
            self.$events.$emit('tasks:reloadLists');
            self.$f7router.back(`/tasks/${API.actorId ? `?actor_id=${API.actorId}` : ''}`, { force: true });
          });
      },
    },
  };
</script>