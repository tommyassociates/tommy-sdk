<template>
  <f7-page>
    <f7-navbar innerClass="forms-blue-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('forms.assignment.create_title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="#" icon-only v-if="allowSave" @click="save">
          <i class="icon f7-icons">check</i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list no-hairlines class="no-margin forms-list">
      <f7-list-item
        link
        :title="$t('forms.assignment.template_label')"
        :after="templateName"
        @click="templateSelectOpened = true"
      >
      </f7-list-item>
      <f7-list-item
        link
        :title="$t('forms.assignment.type_label')"
        :after="$t(`forms.shortcuts_type_options.${type}_label`)"
        @click="typeSelectOpened = true"
      >
      </f7-list-item>
      <f7-list-item
        link
        :title="$t('forms.assignment.deadline_label')"
        :after="$moment(deadline).format('DD MMM YYYY')"
        @click="openDeadLineCalendar()"
      >
      </f7-list-item>

      <!-- Repeat -->
      <f7-list-item divider :title="$t('forms.assignment.repeat_label')" />
      <f7-list-item
        :title="$t('forms.assignment.enabled_label')"
      >
        <f7-toggle :checked="repeat" @change="repeat = $event.target.checked" slot="after" />
      </f7-list-item>
      <f7-list-item
        v-if="repeat"
        link
        class="assignment-frequency-selector"
        :title="$t('forms.assignment.frequency_label')"
        :after="$t(`forms.assignment.frequency_${repeatFrequency}_label`)"
        @click="popoverFrequencyOpened = true"
      >
        <f7-popover target=".assignment-frequency-selector" :opened="popoverFrequencyOpened" @popover:close="popoverFrequencyOpened = false">
          <f7-list>
            <f7-list-item
              v-for="(freq, index) in ['minutes', 'hours', 'days']"
              :key="index"
              radio
              :title="$t(`forms.assignment.frequency_${freq}_label`)"
              :checked="repeatFrequency === freq"
              @change="() => { repeatFrequency = freq; popoverFrequencyOpened = false} "
            />
          </f7-list>
        </f7-popover>
      </f7-list-item>
      <f7-list-item
        v-if="repeat"
        link
        class="assignment-every-selector"
        :title="$t('forms.assignment.every_label')"
        :after="`${repeatEvery} ${$t(`forms.assignment.frequency_${repeatFrequency}_label`)}`"
        @click="popoverEveryOpened = true"
      >
        <f7-popover target=".assignment-frequency-selector" :opened="popoverEveryOpened" @popover:close="popoverEveryOpened = false">
          <f7-list style="height: 300px">
            <f7-list-item
              v-for="n in 60"
              :key="n"
              radio
              :title="n"
              :checked="repeatEvery === n"
              @change="() => { repeatEvery = n; popoverEveryOpened = false} "
            />
          </f7-list>
        </f7-popover>
      </f7-list-item>

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
    data() {
      const templateId = this.$f7route.query.templateId;
      return {
        typeSelectOpened: false,
        templateSelectOpened: false,
        popoverFrequencyOpened: false,
        popoverEveryOpened: false,
        templates: API.cache.templates,

        templateId: templateId ? parseInt(templateId, 10) : null,
        type: 'single',
        deadline: new Date().getTime() + 1000 * 60 * 60 * 24 * 7,
        repeat: false,
        repeatFrequency: 'hours',
        repeatEvery: 2,
      };
    },
    computed: {
      allowSave() {
        const self = this;
        const { templateId } = self;
        if (templateId) {
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
      self.calendar = self.$f7.calendar.create({
        value: [new Date(self.deadline)],
        openIn: 'customModal',
        backdrop: true,
        closeOnSelect: true,
        on: {
          change(cal, val) {
            self.deadline = val[0];
          },
        },
      });
    },
    methods: {
      openDeadLineCalendar() {
        const self = this;
        self.calendar.open();
      },
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        const {
          templateId,
          type,
          deadline,
          repeat,
          repeatFrequency,
          repeatEvery,
        } = self;
        API.createAssignment(self.$root.user, {
          templateId,
          type,
          deadline,
          repeat,
          repeatFrequency,
          repeatEvery,
        }).then(() => {
          self.$f7router.back();
          self.$events.$emit('forms:assignmentcreated');
        });
      },
    },
  };
</script>

