<template>
  <f7-page name="invoicing__list-add" id="invoicing__list-add" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.list_add.title', 'Add List')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="top-0 list-custom">
      <f7-list-item>
        <f7-input type="text" :placeholder="$t('invoicing.list_add.name_placeholder', 'Name')" :value="name" @input="name = $event.target.value"></f7-input>
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
            self.$events.$emit('invoicing:reloadLists');
            self.$f7router.back(`/invoicing/${API.actorId ? `?actor_id=${API.actorId}` : ''}`, { force: true });
          });
      },
    },
  };
</script>