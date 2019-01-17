<template>
  <f7-page name="forms__index" id="forms__index" class="forms__page">
    <f7-navbar innerClass="forms__navbar-inner">
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('forms.index.title', 'Forms')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-f7="gear"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <div class="forms-tabbar no-swipe-panel">
      <div class="forms-tabbar-inner">
        <a class="tab-link tab-link-active" href="#">{{$t('forms.index.menu_templates_label')}}</a>
        <a class="tab-link" href="#">{{$t('forms.index.menu_assigned_label')}}</a>
        <a class="tab-link" href="#">{{$t('forms.index.menu_completed_label')}}</a>
        <a class="tab-link" href="#">{{$t('forms.index.menu_shortcuts_label')}}</a>
        <a class="tab-link" href="#">{{$t('forms.index.menu_myforms_label')}}</a>
      </div>
    </div>

    <f7-fab>
      <i class="icon forms-fab-icon-plus"></i>
      <i class="icon forms-fab-icon-close"></i>
      <f7-fab-buttons position="left">
        <f7-fab-button fab-close>
          <i class="icon forms-fab-icon-pointer"></i>
          <span>{{$t('forms.index_add.shortcut_button')}}</span>
        </f7-fab-button>
        <f7-fab-button fab-close>
          <i class="icon forms-fab-icon-people"></i>
          <span>{{$t('forms.index_add.assign_button')}}</span>
        </f7-fab-button>
        <f7-fab-button fab-close>
          <i class="icon forms-fab-icon-template"></i>
          <span>{{$t('forms.index_add.template_button')}}</span>
        </f7-fab-button>
      </f7-fab-buttons>
    </f7-fab>

  </f7-page>
</template>
<script>
  export default {

  };
</script>

