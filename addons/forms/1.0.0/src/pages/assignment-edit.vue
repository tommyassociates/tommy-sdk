<template>
  <f7-page>
    <f7-navbar innerClass="forms-blue-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('forms.template_details.template_new_title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="#" icon-only v-if="allowSave" @click="save">
          <i class="icon f7-icons">check</i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list no-hairlines class="no-margin forms-list">
      <f7-list-item
        :title="$t('forms.template_edit.template_icon_label')"
        link
      >
        <div
          class="forms-template-icon s60"
          :style="{
            'background-image': iconUrl ? `url(${iconUrl})` : null,
          }"
        ></div>
      </f7-list-item>
    </f7-list>

    <f7-list no-hairlines class="forms-list forms-inputs-list">
      <f7-list-input
        :label="$t('forms.template_edit.template_name_label')"
        :placeholder="$t('forms.template_edit.template_name_label')"
        type="text"
        :value="name"
        @input="name = $event.target.value"
      />
      <f7-list-input
        :label="$t('forms.template_edit.template_description_label')"
        :placeholder="$t('forms.template_edit.template_description_label')"
        type="textarea"
        resizable
        :value="description"
        @input="description = $event.target.value"
      />
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        iconUrl: '',
        name: '',
        description: '',
      };
    },
    computed: {
      allowSave() {
        const self = this;
        const { name, description } = self;
        if (name && name.trim().length && description && description.trim().length) {
          return true;
        }
        return false;
      },
    },
    methods: {
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        const { name, description } = self;
        API.createTemplate(self.$root.user, {
          name,
          description,
        }).then(() => {
          self.$f7router.back();
          self.$events.$emit('forms:templatecreated');
        });
      },
    },
  };
</script>

