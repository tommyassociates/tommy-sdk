<template>
  <f7-page>
    <f7-navbar innerClass="forms-blue-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('forms.shortcut_details.edit_title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="#" icon-only v-if="allowSave" @click="save">
          <i class="icon f7-icons">check</i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list no-hairlines class="no-margin forms-list">
      <f7-list-item
        :title="$t('forms.shortcut_details.shortcut_icon_label')"
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
        inline-label
        :label="$t('forms.shortcut_details.shortcut_name_label')"
        :placeholder="$t('forms.shortcut_details.shortcut_name_label')"
        type="text"
        :value="name"
        @input="name = $event.target.value"
      />
      <f7-list-item
        :title="$t('forms.shortcut_details.shortcut_availbale_label')"
      >
        <f7-toggle slot="after" :checked="available" @change="available = $event.target.checked"/>
      </f7-list-item>
      <f7-list-item
        link
        :title="$t('forms.shortcut_details.shortcut_template_label')"
        :after="templateName"
        @click="templateSelectOpened = true"
      >
      </f7-list-item>
      <f7-list-item
        :title="$t('forms.shortcut_details.shortcut_display_label')"
        smart-select
        :smart-select-params="{ openIn: 'sheet', on: { change(ss, v) { setDisplay(v); } } }"
        :after="display.map(el => $t(`forms.shortcuts_display_options.${el}_label`)).join(', ')"
      >
        <select multiple>
          <option :selected="display.indexOf('menu') >= 0" value="menu">{{$t('forms.shortcuts_display_options.menu_label')}}</option>
          <option :selected="display.indexOf('team') >= 0" value="team">{{$t('forms.shortcuts_display_options.team_label')}}</option>
          <option :selected="display.indexOf('contact') >= 0" value="contact">{{$t('forms.shortcuts_display_options.contact_label')}}</option>
        </select>
      </f7-list-item>
      <f7-list-item
        link
        :title="$t('forms.shortcut_details.shortcut_type_label')"
        :after="$t(`forms.shortcuts_type_options.${type}_label`)"
        @click="typeSelectOpened = true"
      >
      </f7-list-item>
      <f7-list-item
        :title="$t('forms.shortcut_details.shortcut_anonymous_label')"
      >
        <f7-toggle slot="after" :checked="anonymous" @change="anonymous = $event.target.checked"/>
      </f7-list-item>
    </f7-list>

    <f7-list no-hairlines>
      <f7-list-button color="red" @click="deleteShortcut">
        {{$t('forms.template_edit.delete_button')}}
      </f7-list-button>
    </f7-list>

    <f7-popup :opened="typeSelectOpened" @popup:close="typeSelectOpened = false">
      <f7-page>
        <f7-navbar>
          <f7-nav-title>{{$t('forms.assignment.type_label')}}</f7-nav-title>
          <f7-nav-right>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-right>
        </f7-navbar>
        <template v-for="(t, index) in ['single', 'multi', 'recent']">
          <f7-list no-hairlines :key="index">
            <f7-list-item
              radio
              :checked="type === t"
              :title="$t(`forms.shortcuts_type_options.${t}_label`)"
              @change="() => { type = t; typeSelectOpened = false }"
            />
            <f7-block-footer>{{$t(`forms.shortcuts_type_options.${t}_text`)}}</f7-block-footer>
          </f7-list>
        </template>
      </f7-page>
    </f7-popup>
    <f7-popup :opened="templateSelectOpened" @popup:close="templateSelectOpened = false">
      <f7-page>
        <f7-navbar>
          <f7-nav-title>{{$t('forms.shortcut_details_template_select.title')}}</f7-nav-title>
          <f7-nav-right>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-right>
        </f7-navbar>

        <f7-list
          class="forms-templates-list"
          media-list
          no-hairlines
        >
          <f7-list-item
            v-for="template in templates"
            :key="template.id"
            :title="template.data.name"
            :text="template.data.description"
            radio
            :checked="template.id === templateId"
            @change="() => { templateId = template.id; templateSelectOpened = false }"
          >
            <div
              class="forms-template-icon s70"
              slot="media"
              :style="{
                'background-image': template.iconUrl ? `url(${template.iconUrl})` : null,
              }"
            ></div>
          </f7-list-item>
        </f7-list>
      </f7-page>
    </f7-popup>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      shortcut: Object,
    },
    data() {
      const shortcut = this.shortcut;
      const {
        iconUrl,
        name,
        available,
        templateId,
        display,
        type,
        anonymous,
      } = shortcut.data;

      return {
        typeSelectOpened: false,
        templateSelectOpened: false,
        templates: API.cache.templates,

        iconUrl,
        name,
        available,
        templateId,
        display,
        type,
        anonymous,
      };
    },
    computed: {
      allowSave() {
        const self = this;
        const { templateId, name } = self;
        if (templateId && name.trim().length) {
          return true;
        }
        return false;
      },
      templateName() {
        const self = this;
        if (!self.templateId) {
          return self.$t('forms.index.notset_label');
        }
        if (!self.templates) return '';
        const template = self.templates.filter(t => t.id === self.templateId)[0];
        if (!template) return '';
        return template.data.name;
      },
    },
    mounted() {
      const self = this;
      if (!self.templates) {
        API.getTemplates(self.$root.user).then((data) => {
          self.templates = data;
        });
      }
    },
    methods: {
      setDisplay(v) {
        const self = this;
        self.display = v;
      },
      deleteShortcut() {
        const self = this;
        self.$f7.dialog.confirm(self.$t('forms.shortcut_delete_confirm.text'), () => {
          API.deleteShortcut(self.shortcut.id).then(() => {
            self.$f7router.back();
            self.$events.$emit('forms:shortcutdeleted');
          });
        });
      },
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        const {
          iconUrl,
          name,
          available,
          templateId,
          display,
          type,
          anonymous,
        } = self;
        API.updateShortcut({
          id: self.shortcut.id,
          data: Object.assign({}, self.shortcut.data, {
            iconUrl,
            name,
            available,
            templateId,
            display,
            type,
            anonymous,
          }),
        }).then(() => {
          self.$f7router.back();
          self.$events.$emit('forms:shortcutupdated');
        });
      },
    },
  };
</script>

