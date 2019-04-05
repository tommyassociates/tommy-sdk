<template>
  <f7-page>
    <f7-navbar innerClass="forms-blue-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('forms.template_edit.title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="#" icon-only v-if="allowSave" @click="save">
          <i class="icon f7-icons">check</i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-list
      no-hairlines
      class="no-margin forms-list"
      v-if="template"
    >
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

    <f7-list no-hairlines class="forms-list forms-inputs-list" v-if="template">
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
      <f7-list-item
        link
        :title="$t('forms.template_edit.template_completes_label')"
        :after="199"
      />
      <f7-list-item
        link
        :title="$t('forms.template_edit.template_assignments_label')"
        :after="10"
      />
      <f7-list-item
        link
        :title="$t('forms.template_edit.template_shortcuts_label')"
        :after="2"
      />
    </f7-list>

    <f7-list no-hairlines v-if="template">
      <f7-list-button color="red" @click="deleteTemplate">
        {{$t('forms.template_edit.delete_button')}}
      </f7-list-button>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      id: [String, Number],
    },
    data() {
      return {
        template: null,
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
    mounted() {
      const self = this;
      self.getTemplate();
    },
    methods: {
      deleteTemplate() {
        const self = this;
        self.$f7.dialog.confirm(self.$t('forms.template_delete_confirm.text'), () => {
          API.deleteTemplate(self.template.id).then(() => {
            self.$f7router.back();
            self.$events.$emit('forms:templatedeleted');
          });
        });
      },
      getTemplate() {
        const self = this;
        API.getTemplate(self.$root.user, self.id).then((data) => {
          const {
            name,
            description,
            iconUrl,
          } = data.data;
          self.template = data;
          self.name = name;
          self.description = description;
          self.iconUrl = iconUrl;
        });
      },
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        const { name, description } = self;
        Object.assign(self.template.data, {
          name,
          description,
        });
        console.log(self.template.data);
        API.updateTemplate(self.template).then(() => {
          self.$f7router.back();
          self.$events.$emit('forms:templateupdated');
        });
      },
    },
  };
</script>

