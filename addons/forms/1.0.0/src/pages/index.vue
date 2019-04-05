<template>
  <f7-page>
    <f7-navbar innerClass="forms-blue-navbar-inner">
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('forms.index.title', 'Forms')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-f7="gear"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <div class="forms-scrollable-tabbar no-swipe-panel">
      <div class="forms-tabbar-inner">
        <a class="tab-link tab-link-active" href="#tab-templates">{{$t('forms.index.menu_templates_label')}}</a>
        <a class="tab-link" href="#tab-assigned">{{$t('forms.index.menu_assigned_label')}}</a>
        <a class="tab-link" href="#tab-completed">{{$t('forms.index.menu_completed_label')}}</a>
        <a class="tab-link" href="#tab-shortcuts">{{$t('forms.index.menu_shortcuts_label')}}</a>
        <a class="tab-link" href="#tab-my-forms">{{$t('forms.index.menu_myforms_label')}}</a>
      </div>
    </div>

    <div slot="fixed" class="forms-fab-backdrop" v-if="fabBackdropVisible"></div>
    <f7-fab class="forms-fab" @fab:open.native="fabBackdropVisible = true" @fab:close.native="fabBackdropVisible = false">
      <i class="icon forms-fab-icon-plus"></i>
      <i class="icon forms-fab-icon-close"></i>
      <f7-fab-buttons position="left">
        <f7-fab-button fab-close href="/forms/shortcut-create/">
          <i class="icon forms-fab-icon-pointer"></i>
          <span>{{$t('forms.index_add.shortcut_button')}}</span>
        </f7-fab-button>
        <f7-fab-button fab-close href="/forms/assignment-create/">
          <i class="icon forms-fab-icon-people"></i>
          <span>{{$t('forms.index_add.assign_button')}}</span>
        </f7-fab-button>
        <f7-fab-button fab-close href="/forms/template-create/">
          <i class="icon forms-fab-icon-template"></i>
          <span>{{$t('forms.index_add.template_button')}}</span>
        </f7-fab-button>
      </f7-fab-buttons>
    </f7-fab>

    <f7-tabs>
      <f7-tab tab-active id="tab-templates">
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
            swipeout
            :link="`/forms/template-details/${template.id}/`"
            :route-props="{ template }"
          >
            <div
              class="forms-template-icon s70"
              slot="media"
              :style="{
                'background-image': template.iconUrl ? `url(${template.iconUrl})` : null,
              }"
            ></div>
            <f7-swipeout-actions right>
              <f7-swipeout-button
                class="forms-swipeout-button-green"
                :href="`/forms/assignment-create/?templateId=${template.id}`"
                :route-props="{ template }"
              >{{$t('forms.index.assign_button')}}</f7-swipeout-button>

              <f7-swipeout-button
                class="forms-swipeout-button-blue"
                :href="`/forms/template-edit/${template.id}/`"
              >{{$t('forms.index.edit_button')}}</f7-swipeout-button>
            </f7-swipeout-actions>
          </f7-list-item>
        </f7-list>
      </f7-tab>
      <f7-tab id="tab-assigned">
        <a href="#" class="forms-card">
          <div class="forms-card-header">
            <div class="forms-card-date">31st August 2018</div>
            <div class="forms-card-status">Enabled</div>
          </div>
          <div class="forms-card-content">
            <div class="forms-card-rows">
              <div class="forms-card-row">
                <i class="forms-card-icon-template"></i>
                <span>Risk Assessment</span>
              </div>
              <div class="forms-card-row">
                <i class="forms-card-icon-user"></i>
                <span>Safety Office</span>
              </div>
              <div class="forms-card-row">
                <i class="forms-card-icon-tag"></i>
                <span>Custom Tags</span>
              </div>
            </div>
          </div>
        </a>
        <a href="#" class="forms-card">
          <div class="forms-card-header">
            <div class="forms-card-date">31st August 2018</div>
            <div class="forms-card-status">Enabled</div>
          </div>
          <div class="forms-card-content">
            <div class="forms-card-rows">
              <div class="forms-card-row">
                <i class="forms-card-icon-template"></i>
                <span>Risk Assessment</span>
              </div>
              <div class="forms-card-row">
                <i class="forms-card-icon-user"></i>
                <span>Safety Office</span>
              </div>
              <div class="forms-card-row">
                <i class="forms-card-icon-tag"></i>
                <span>Custom Tags</span>
              </div>
            </div>
          </div>
        </a>
      </f7-tab>
      <f7-tab id="tab-completed">
        <a href="#" class="forms-card">
          <div class="forms-card-header">
            <div class="forms-card-date">31st August 2018</div>
          </div>
          <div class="forms-card-content">
            <f7-list
              class="forms-templates-list"
              media-list
              no-hairlines
            >
              <f7-list-item
                title="Home Service Feedback"
                text="Collect user feedback"
              >
                <div class="forms-template-icon s70" slot="media"></div>
              </f7-list-item>
            </f7-list>
            <div class="forms-card-rows">
              <div class="forms-card-row">
                <i class="forms-card-icon-user-round"></i>
                <span>Mason Fok</span>
              </div>
            </div>
          </div>
        </a>
      </f7-tab>
      <f7-tab id="tab-shortcuts">
        <a href="#" class="forms-card">
          <div class="forms-card-header">
            <div class="forms-card-date">31st August 2018</div>
          </div>
          <div class="forms-card-content">
            <f7-list
              class="forms-templates-list"
              media-list
              no-hairlines
            >
              <f7-list-item
                title="Home Service Feedback"
                text="Collect user feedback"
              >
                <div class="forms-template-icon s70" slot="media"></div>
              </f7-list-item>
            </f7-list>
            <div class="forms-card-rows">
              <div class="forms-card-row">
                <i class="forms-card-icon-user"></i>
                <span>Safety Office</span>
              </div>
              <div class="forms-card-row">
                <i class="forms-card-icon-tag"></i>
                <span>Custom Tags</span>
              </div>
              <div class="forms-card-row">
                <i class="forms-card-icon-eye"></i>
                <span>Main Menu, Team Profile</span>
              </div>
            </div>
          </div>
        </a>
      </f7-tab>
      <f7-tab id="tab-my-forms">
        <f7-list
          class="forms-templates-list"
          media-list
          no-hairlines
        >
          <f7-list-item divider title="Assigned" />
          <f7-list-item
            title="Home Service Feedback"
            text="Collect user feedback"
            link
          >
            <div class="forms-template-icon s70" slot="media"></div>
            <div>
              <span class="forms-templates-list-badge">17 June 2018</span>
            </div>
          </f7-list-item>
          <f7-list-item divider title="Available" />
          <f7-list-item
            title="Safety Check"
            text="Collect user feedback"
            link
          >
            <div class="forms-template-icon s70" slot="media"></div>
          </f7-list-item>
          <f7-list-item
            title="Risk Assessment"
            text="Collect user feedback"
            link
          >
            <div class="forms-template-icon s70" slot="media"></div>
          </f7-list-item>
        </f7-list>
      </f7-tab>
    </f7-tabs>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        fabBackdropVisible: false,
        templates: null,
        assignments: null,
        completed: null,
        shortcuts: null,
        my_forms: null,
      };
    },
    mounted() {
      const self = this;
      self.getTemplates();
      self.$events.$on('forms:assignmentcreated', self.getAssignments);
      self.$events.$on('forms:assignmentupdated', self.getAssignments);
      self.$events.$on('forms:assignmentdeleted', self.getAssignments);
      self.$events.$on('forms:templatecreated', self.getTemplates);
      self.$events.$on('forms:templateupdated', self.getTemplates);
      self.$events.$on('forms:templatedeleted', self.getTemplates);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off('forms:assignmentcreated', self.getAssignments);
      self.$events.$off('forms:assignmentupdated', self.getAssignments);
      self.$events.$off('forms:assignmentdeleted', self.getAssignments);
      self.$events.$off('forms:templatecreated', self.getTemplates);
      self.$events.$off('forms:templateupdated', self.getTemplates);
      self.$events.$off('forms:templatedeleted', self.getTemplates);
    },
    methods: {
      getAssignments() {
        const self = this;
        API.getAssignments(self.$root.user)
          .then((data) => {
            self.assignments = data;
          });
      },
      getTemplates() {
        const self = this;
        API.getTemplates(self.$root.user)
          .then((data) => {
            self.templates = data;
          });
      },
    },
  };
</script>

